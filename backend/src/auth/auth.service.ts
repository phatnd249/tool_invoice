import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private generateAccessToken(userId: string, email: string) {
    const jti = randomUUID();
    const expiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m';
    const token = this.jwt.sign(
      { sub: userId, email, jti },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: expiresIn as any,
      },
    );
    return { token, jti };
  }

  private generateRefreshToken(userId: string) {
    const jti = randomUUID();
    const expiresIn =
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';
    const token = this.jwt.sign(
      { sub: userId, jti },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: expiresIn as any,
      },
    );
    // Parse expiry for DB storage
    const daysMatch = expiresIn.match(/^(\d+)d$/);
    const minutesMatch = expiresIn.match(/^(\d+)m$/);
    const ms = daysMatch
      ? parseInt(daysMatch[1]) * 86400000
      : minutesMatch
        ? parseInt(minutesMatch[1]) * 60000
        : 7 * 86400000;
    const expiresAt = new Date(Date.now() + ms);
    return { token, jti, expiresAt };
  }

  private async saveRefreshToken(
    userId: string,
    jti: string,
    expiresAt: Date,
  ) {
    await this.prisma.refreshToken.create({
      data: { userId, jti, expiresAt },
    });
  }

  // ─── Register ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const emailVerifyToken = randomUUID();
    const emailVerifyExpiry = new Date(Date.now() + 24 * 3600000); // 24h

    await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        password: hashedPassword,
        emailVerifyToken,
        emailVerifyExpiry,
      },
    });

    await this.mail.sendEmailVerification(dto.email, emailVerifyToken);
    return { message: 'Registration successful. Please verify your email.' };
  }

  // ─── Verify Email ─────────────────────────────────────────────────────────

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { emailVerifyToken: token },
    });
    if (!user) throw new BadRequestException('Invalid verification token');
    if (user.emailVerifyExpiry && user.emailVerifyExpiry < new Date()) {
      throw new BadRequestException('Verification token has expired');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        status: 'ACTIVE',
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      },
    });

    return { message: 'Email verified successfully. You can now log in.' };
  }

  // ─── Resend Verification ──────────────────────────────────────────────────

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) {
      // Return generic message to avoid user enumeration
      return { message: 'If the email exists, a verification link has been sent.' };
    }
    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    const emailVerifyToken = randomUUID();
    const emailVerifyExpiry = new Date(Date.now() + 24 * 3600000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyToken, emailVerifyExpiry },
    });

    await this.mail.sendEmailVerification(email, emailVerifyToken);
    return { message: 'If the email exists, a verification link has been sent.' };
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Check account lock
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remaining = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Account is temporarily locked. Try again in ${remaining} minute(s).`,
      );
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      const attempts = user.loginAttempts + 1;
      const isLocked = attempts >= MAX_LOGIN_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: attempts,
          lockUntil: isLocked ? new Date(Date.now() + LOCK_DURATION_MS) : null,
        },
      });
      if (isLocked) {
        throw new UnauthorizedException(
          'Too many failed attempts. Account locked for 15 minutes.',
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'INACTIVE') {
      throw new UnauthorizedException('Please verify your email before logging in');
    }
    if (user.status === 'BANNED') {
      throw new UnauthorizedException('Your account has been banned');
    }

    // Reset login attempts
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const { token: accessToken, jti: accessJti } = this.generateAccessToken(
      user.id,
      user.email,
    );
    const {
      token: refreshToken,
      jti: refreshJti,
      expiresAt,
    } = this.generateRefreshToken(user.id);

    await this.saveRefreshToken(user.id, refreshJti, expiresAt);

    return { accessToken, refreshToken };
  }

  // ─── Refresh Tokens ───────────────────────────────────────────────────────

  async refreshTokens(refreshToken: string) {
    let payload: { sub: string; jti: string };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { jti: payload.jti },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or revoked');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is not active');
    }

    // Rotate: revoke old, issue new
    await this.prisma.refreshToken.update({
      where: { jti: payload.jti },
      data: { revokedAt: new Date() },
    });

    const { token: newAccessToken } = this.generateAccessToken(
      user.id,
      user.email,
    );
    const {
      token: newRefreshToken,
      jti: newRefreshJti,
      expiresAt,
    } = this.generateRefreshToken(user.id);

    await this.saveRefreshToken(user.id, newRefreshJti, expiresAt);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(userId: string, accessJti: string, refreshToken: string) {
    // Blacklist current access token
    const accessPayload = this.jwt.decode(
      this.jwt.sign({ sub: userId, jti: accessJti }, { secret: 'temp' }),
    ) as { exp?: number };
    const expiresAt = new Date(Date.now() + 15 * 60000); // fallback: 15m
    await this.prisma.tokenBlacklist.upsert({
      where: { jti: accessJti },
      create: { userId, jti: accessJti, expiresAt },
      update: {},
    });

    // Revoke refresh token
    try {
      const payload: { jti: string } = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
      await this.prisma.refreshToken.updateMany({
        where: { jti: payload.jti, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Ignore invalid refresh token on logout
    }

    return { message: 'Logged out successfully' };
  }

  // ─── Logout All ───────────────────────────────────────────────────────────

  async logoutAll(userId: string, accessJti: string) {
    const expiresAt = new Date(Date.now() + 15 * 60000);
    await this.prisma.tokenBlacklist.upsert({
      where: { jti: accessJti },
      create: { userId, jti: accessJti, expiresAt },
      update: {},
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Logged out from all devices successfully' };
  }

  // ─── Forgot Password ──────────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });

    // Generic response to avoid user enumeration
    if (!user) {
      return { message: 'If the email exists, a reset link has been sent.' };
    }

    const resetPasswordToken = randomUUID();
    const resetPasswordExpiry = new Date(Date.now() + 3600000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken, resetPasswordExpiry },
    });

    await this.mail.sendPasswordReset(email, resetPasswordToken);
    return { message: 'If the email exists, a reset link has been sent.' };
  }

  // ─── Reset Password ───────────────────────────────────────────────────────

  async resetPassword(token: string, password: string, confirmPassword: string) {
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.prisma.user.findUnique({
      where: { resetPasswordToken: token },
    });
    if (!user) throw new BadRequestException('Invalid or expired reset token');
    if (user.resetPasswordExpiry && user.resetPasswordExpiry < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    const isSame = await bcrypt.compare(password, user.password);
    if (isSame) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
      },
    });

    // Revoke all refresh tokens after password reset
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Password reset successfully. Please log in again.' };
  }
}
