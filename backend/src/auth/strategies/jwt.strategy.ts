import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  jti: string;
  exp?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  jti: string;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Không có fallback secret mặc định — phải cấu hình JWT_ACCESS_SECRET.
    // Boot sẽ fail rõ ràng nếu thiếu (validateEnv đã cảnh báo từ ConfigModule).
    const secret = config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_ACCESS_SECRET must be configured (set JWT_ACCESS_SECRET in .env)',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    // Check token is not blacklisted
    const blacklisted = await this.prisma.tokenBlacklist.findUnique({
      where: { jti: payload.jti },
    });
    if (blacklisted)
      throw new UnauthorizedException('Phiên đăng nhập đã bị thu hồi');

    // Check user exists, is active and not deleted
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'Tài khoản chưa được kích hoạt hoặc không khả dụng',
      );
    }

    return {
      id: user.id,
      email: user.email,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
