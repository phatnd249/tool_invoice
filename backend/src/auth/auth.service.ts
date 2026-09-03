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
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email này đã được sử dụng');

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
    return { message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.' };
  }

  // ─── Verify Email ─────────────────────────────────────────────────────────

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { emailVerifyToken: token },
    });
    if (!user) throw new BadRequestException('Mã xác thực không hợp lệ');
    if (user.emailVerifyExpiry && user.emailVerifyExpiry < new Date()) {
      throw new BadRequestException('Mã xác thực đã hết hạn');
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

    return { message: 'Xác thực email thành công. Bạn có thể đăng nhập ngay.' };
  }

  // ─── Resend Verification ──────────────────────────────────────────────────

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) {
      // Return generic message to avoid user enumeration
      return { message: 'Nếu email tồn tại trong hệ thống, liên kết xác thực đã được gửi.' };
    }
    if (user.emailVerified) {
      throw new BadRequestException('Email này đã được xác thực trước đó');
    }

    const emailVerifyToken = randomUUID();
    const emailVerifyExpiry = new Date(Date.now() + 24 * 3600000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyToken, emailVerifyExpiry },
    });

    await this.mail.sendEmailVerification(email, emailVerifyToken);
    return { message: 'Nếu email tồn tại trong hệ thống, liên kết xác thực đã được gửi.' };
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });

    if (!user) throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');

    // Check account lock
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remaining = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Tài khoản tạm thời bị khóa. Vui lòng thử lại sau ${remaining} phút.`,
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
          'Đăng nhập sai quá nhiều lần. Tài khoản đã bị khóa trong 15 phút.',
        );
      }
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    if (user.status === 'INACTIVE') {
      throw new UnauthorizedException('Tài khoản chưa được kích hoạt. Vui lòng xác thực email trước khi đăng nhập.');
    }
    if (user.status === 'BANNED') {
      throw new UnauthorizedException('Tài khoản của bạn đã bị khóa hoặc vô hiệu hóa');
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
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { jti: payload.jti },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã bị thu hồi');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Tài khoản chưa được kích hoạt hoặc không khả dụng');
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

    return { message: 'Đăng xuất thành công' };
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

    return { message: 'Đã đăng xuất khỏi tất cả các thiết bị' };
  }

  // ─── Forgot Password ──────────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });

    // Generic response to avoid user enumeration
    if (!user) {
      return { message: 'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.' };
    }

    const resetPasswordToken = randomUUID();
    const resetPasswordExpiry = new Date(Date.now() + 3600000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken, resetPasswordExpiry },
    });

    await this.mail.sendPasswordReset(email, resetPasswordToken);
    return { message: 'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.' };
  }

  // ─── Reset Password ───────────────────────────────────────────────────────

  async resetPassword(token: string, password: string, confirmPassword: string) {
    if (password !== confirmPassword) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    const user = await this.prisma.user.findUnique({
      where: { resetPasswordToken: token },
    });
    if (!user) throw new BadRequestException('Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    if (user.resetPasswordExpiry && user.resetPasswordExpiry < new Date()) {
      throw new BadRequestException('Mã đặt lại mật khẩu đã hết hạn');
    }

    const isSame = await bcrypt.compare(password, user.password);
    if (isSame) {
      throw new BadRequestException(
        'Mật khẩu mới phải khác với mật khẩu hiện tại',
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

    return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }
}
