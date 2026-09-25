import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

const mockPrisma = {
  tokenBlacklist: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-secret'),
};

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    jest.clearAllMocks();
  });

  it('should return AuthUser for a valid token payload', async () => {
    mockPrisma.tokenBlacklist.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'uid-1',
      email: 'john@example.com',
      status: 'ACTIVE',
    });

    const result = await strategy.validate({
      sub: 'uid-1',
      email: 'john@example.com',
      jti: 'jti-1',
    });

    expect(result).toEqual({
      id: 'uid-1',
      email: 'john@example.com',
      jti: 'jti-1',
    });
  });

  it('should throw UnauthorizedException when token is blacklisted', async () => {
    mockPrisma.tokenBlacklist.findUnique.mockResolvedValue({ jti: 'jti-1' });

    await expect(
      strategy.validate({
        sub: 'uid-1',
        email: 'john@example.com',
        jti: 'jti-1',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when user not found', async () => {
    mockPrisma.tokenBlacklist.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: 'uid-1',
        email: 'john@example.com',
        jti: 'jti-1',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when user is INACTIVE', async () => {
    mockPrisma.tokenBlacklist.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'uid-1',
      status: 'INACTIVE',
    });

    await expect(
      strategy.validate({
        sub: 'uid-1',
        email: 'john@example.com',
        jti: 'jti-1',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when user is BANNED', async () => {
    mockPrisma.tokenBlacklist.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'uid-1',
      status: 'BANNED',
    });

    await expect(
      strategy.validate({
        sub: 'uid-1',
        email: 'john@example.com',
        jti: 'jti-1',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
