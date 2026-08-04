import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$hashed$'),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcrypt';
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  tokenBlacklist: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
  verify: jest.fn(),
  decode: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_SECRET: 'refresh-secret',
      JWT_REFRESH_EXPIRES_IN: '7d',
    };
    return config[key];
  }),
};

const mockMailService = {
  sendEmailVerification: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    mockJwtService.sign.mockReturnValue('mock.jwt.token');
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, string> = {
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return config[key];
    });
  });

  // ─── register ─────────────────────────────────────────────────────────────

  describe('register', () => {
    const dto = {
      fullName: 'John Doe',
      email: 'john@example.com',
      password: 'Password1',
      confirmPassword: 'Password1',
    };

    it('should register a new user and send verification email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'uid-1', ...dto });
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$hashed$');

      const result = await service.register(dto);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: dto.email },
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fullName: dto.fullName,
            email: dto.email,
            password: '$hashed$',
          }),
        }),
      );
      expect(mockMailService.sendEmailVerification).toHaveBeenCalledWith(
        dto.email,
        expect.any(String),
      );
      expect(result.message).toContain('verify your email');
    });

    it('should throw ConflictException if email already in use', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1' });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if passwords do not match', async () => {
      await expect(
        service.register({ ...dto, confirmPassword: 'WrongPass' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── verifyEmail ──────────────────────────────────────────────────────────

  describe('verifyEmail', () => {
    it('should activate account on valid token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        emailVerifyExpiry: new Date(Date.now() + 10000),
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.verifyEmail('valid-token');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emailVerified: true, status: 'ACTIVE' }),
        }),
      );
      expect(result.message).toContain('verified successfully');
    });

    it('should throw BadRequestException on invalid token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail('bad-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException on expired token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        emailVerifyExpiry: new Date(Date.now() - 1000),
      });

      await expect(service.verifyEmail('expired-token')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── resendVerification ───────────────────────────────────────────────────

  describe('resendVerification', () => {
    it('should resend verification email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        emailVerified: false,
        deletedAt: null,
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.resendVerification('john@example.com');
      expect(mockMailService.sendEmailVerification).toHaveBeenCalled();
      expect(result.message).toBeDefined();
    });

    it('should return generic message when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.resendVerification('ghost@example.com');
      expect(result.message).toBeDefined();
      expect(mockMailService.sendEmailVerification).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if email already verified', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        emailVerified: true,
        deletedAt: null,
      });

      await expect(service.resendVerification('john@example.com')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── login ────────────────────────────────────────────────────────────────

  describe('login', () => {
    const activeUser = {
      id: 'uid-1',
      email: 'john@example.com',
      password: '$hashed$',
      status: 'ACTIVE',
      loginAttempts: 0,
      lockUntil: null,
      deletedAt: null,
    };

    it('should return access and refresh tokens on successful login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({
        email: activeUser.email,
        password: 'Password1',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'x@x.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockPrisma.user.update.mockResolvedValue({});

      await expect(
        service.login({ email: activeUser.email, password: 'Wrong1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when account is locked', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        lockUntil: new Date(Date.now() + 60000),
      });

      await expect(
        service.login({ email: activeUser.email, password: 'Password1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when account is INACTIVE', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        status: 'INACTIVE',
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ email: activeUser.email, password: 'Password1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when account is BANNED', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        status: 'BANNED',
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ email: activeUser.email, password: 'Password1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should lock account after 5 failed login attempts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        loginAttempts: 4,
        lockUntil: null,
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockPrisma.user.update.mockResolvedValue({});

      await expect(
        service.login({ email: activeUser.email, password: 'Wrong1' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            loginAttempts: 5,
            lockUntil: expect.any(Date),
          }),
        }),
      );
    });
  });

  // ─── refreshTokens ────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    it('should rotate refresh token and return new tokens', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'uid-1', jti: 'rt-jti-1' });
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        jti: 'rt-jti-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        email: 'john@example.com',
        status: 'ACTIVE',
        deletedAt: null,
      });
      mockPrisma.refreshToken.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refreshTokens('valid.refresh.token');

      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jti: 'rt-jti-1' },
          data: { revokedAt: expect.any(Date) },
        }),
      );
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw UnauthorizedException on invalid refresh token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(service.refreshTokens('bad.token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException on revoked refresh token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'uid-1', jti: 'rt-jti-1' });
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        jti: 'rt-jti-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(service.refreshTokens('revoked.token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should blacklist access token and revoke refresh token', async () => {
      mockPrisma.tokenBlacklist.upsert.mockResolvedValue({});
      mockJwtService.verify.mockReturnValue({ jti: 'rt-jti-1' });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.logout('uid-1', 'at-jti-1', 'valid.refresh.token');

      expect(mockPrisma.tokenBlacklist.upsert).toHaveBeenCalled();
      expect(result.message).toContain('Logged out');
    });
  });

  // ─── logoutAll ────────────────────────────────────────────────────────────

  describe('logoutAll', () => {
    it('should blacklist access token and revoke all refresh tokens', async () => {
      mockPrisma.tokenBlacklist.upsert.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.logoutAll('uid-1', 'at-jti-1');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'uid-1', revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        }),
      );
      expect(result.message).toContain('all devices');
    });
  });

  // ─── forgotPassword ───────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('should send reset email when user exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        email: 'john@example.com',
        deletedAt: null,
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.forgotPassword('john@example.com');

      expect(mockMailService.sendPasswordReset).toHaveBeenCalledWith(
        'john@example.com',
        expect.any(String),
      );
      expect(result.message).toBeDefined();
    });

    it('should return generic message even when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('ghost@example.com');

      expect(result.message).toBeDefined();
      expect(mockMailService.sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  // ─── resetPassword ────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('should reset password on valid token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        password: '$oldhashed$',
        resetPasswordExpiry: new Date(Date.now() + 10000),
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$newhashed$');
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({});

      const result = await service.resetPassword(
        'valid-token',
        'NewPass1',
        'NewPass1',
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ password: '$newhashed$' }),
        }),
      );
      expect(result.message).toContain('reset successfully');
    });

    it('should throw BadRequestException when passwords do not match', async () => {
      await expect(
        service.resetPassword('token', 'NewPass1', 'Different1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on invalid token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword('bad-token', 'NewPass1', 'NewPass1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if new password is same as current', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        password: '$hashed$',
        resetPasswordExpiry: new Date(Date.now() + 10000),
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.resetPassword('valid-token', 'SamePass1', 'SamePass1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
