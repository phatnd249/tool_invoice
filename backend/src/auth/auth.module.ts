import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SseJwtStrategy } from './strategies/sse-jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SseAuthGuard } from './guards/sse-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), MailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    SseJwtStrategy,
    JwtAuthGuard,
    SseAuthGuard,
    PermissionsGuard,
  ],
  exports: [JwtAuthGuard, SseAuthGuard, PermissionsGuard, JwtModule],
})
export class AuthModule {}
