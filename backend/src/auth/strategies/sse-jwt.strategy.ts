import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';
import type { JwtPayload, AuthUser } from './jwt.strategy';

/**
 * Custom JWT extractor for SSE: lấy token từ query string ?token=xxx
 * hoặc từ Authorization header (fallback).
 */
function extractJwtFromQueryOrHeader(req: Request): string | null {
  // Ưu tiên query param (cho EventSource)
  if (req.query?.token) {
    return req.query.token as string;
  }
  // Fallback: Authorization header
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class SseJwtStrategy extends PassportStrategy(Strategy, 'sse-jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: extractJwtFromQueryOrHeader,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') || 'access-secret',
      ignoreExpiration: false,
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    // Check token is not blacklisted
    const blacklisted = await this.prisma.tokenBlacklist.findUnique({
      where: { jti: payload.jti },
    });
    if (blacklisted) throw new UnauthorizedException('Token has been revoked');

    // Check user exists, is active and not deleted
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is inactive or not found');
    }

    return { id: user.id, email: user.email, jti: payload.jti };
  }
}
