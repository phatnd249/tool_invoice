import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { GdtAuthService } from './gdt-auth.service';
import { CaptchaResolverService } from './captcha-resolver.service';
import { ConfigService } from '@nestjs/config';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GdtAuthService', () => {
  let service: GdtAuthService;
  let captchaResolver: jest.Mocked<CaptchaResolverService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GdtAuthService,
        {
          provide: CaptchaResolverService,
          useValue: { resolve: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((k: string) => (k === 'GEMINI_API_KEY' ? 'test-key' : null)) },
        },
      ],
    }).compile();

    service = module.get(GdtAuthService);
    captchaResolver = module.get(CaptchaResolverService);
    jest.clearAllMocks();
  });

  it('sends anti-bot headers (request-id, End-Point, Action, Origin) on authenticate', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { token: 'tok-123' } });

    const token = await service.authenticate('0313170881', 'pass', 'ckey1', 'ABCXYZ');

    expect(token).toBe('tok-123');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockedAxios.post.mock.calls[0];
    expect(url).toContain('/security-taxpayer/authenticate');
    expect(body).toEqual({
      username: '0313170881',
      password: 'pass',
      ckey: 'ckey1',
      cvalue: 'ABCXYZ',
    });
    const headers = config.headers;
    expect(headers['End-Point']).toBe('/');
    expect(headers['Action'] === '' || headers['Action'] === undefined).toBe(true);
    expect(headers['request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(headers.Origin).toBe('https://hoadondientu.gdt.gov.vn');
    expect(headers.Referer).toBe('https://hoadondientu.gdt.gov.vn/');
  });

  it('generates a fresh request-id on every call', async () => {
    mockedAxios.post.mockResolvedValue({ data: { token: 'tok' } });

    await service.authenticate('u', 'p', 'ck', 'AAAAAA');
    await service.authenticate('u', 'p', 'ck', 'AAAAAA');
    const first = mockedAxios.post.mock.calls[0][2].headers['request-id'];
    const second = mockedAxios.post.mock.calls[1][2].headers['request-id'];
    expect(first).not.toBe(second);
  });

  it('throws BadRequestException with GDT message when login fails', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      response: {
        data: { message: 'Tài khoản hoặc mật khẩu không đúng.' },
      },
    });

    await expect(
      service.authenticate('u', 'p', 'ck', 'AAAAAA'),
    ).rejects.toThrow(BadRequestException);
  });

  it('sends anti-bot headers + Bearer token on profile call', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { name: 'CÔNG TY ABC' } });

    const name = await service.getTaxpayerName('tok-xyz');

    expect(name).toBe('CÔNG TY ABC');
    const [url, config] = mockedAxios.get.mock.calls[0];
    expect(url).toContain('/security-taxpayer/profile');
    expect(config.headers.Authorization).toBe('Bearer tok-xyz');
    expect(config.headers['End-Point']).toBe('/');
    expect(config.headers['request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});