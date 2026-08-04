import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaptchaResolverService } from './captcha-resolver.service';
import axios from 'axios';

@Injectable()
export class GdtAuthService {
  private readonly logger = new Logger(GdtAuthService.name);

  private readonly gdtBaseUrl = 'https://hoadondientu.gdt.gov.vn/api';
  private readonly headers = {
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0',
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://hoadondientu.gdt.gov.vn/',
  };

  constructor(
    private readonly config: ConfigService,
    private readonly captchaResolver: CaptchaResolverService,
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Đăng nhập GDT tự động (giải captcha bằng Gemini)
   */
  async loginAuto(
    taxCode: string,
    lookupPassword: string,
    maxRetries: number = 3,
  ): Promise<string> {
    const geminiApiKey = this.config.get<string>('GEMINI_API_KEY');

    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      this.logger.log(
        `Login attempt ${attempt}/${maxRetries} for ${taxCode}`,
      );

      try {
        const { ckey, cvalue } =
          await this.captchaResolver.resolve(geminiApiKey);

        if (!cvalue || cvalue.length !== 6) {
          this.logger.warn(
            `Invalid captcha length (${cvalue?.length}), retrying...`,
          );
          continue;
        }

        return await this.authenticate(taxCode, lookupPassword, ckey, cvalue);
      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';

        // Fail fast if credentials are wrong
        const isCredentialError =
          errorMsg.includes('tài khoản') ||
          errorMsg.includes('mật khẩu') ||
          errorMsg.includes('không đúng') ||
          errorMsg.includes('không tồn tại');

        if (isCredentialError) {
          throw error;
        }

        if (attempt >= maxRetries) {
          throw new BadRequestException(
            `Failed to authenticate with GDT after ${maxRetries} attempts: ${error.message}`,
          );
        }
      }
    }

    throw new BadRequestException('GDT authentication failed');
  }

  /**
   * Đăng nhập GDT thủ công (với captcha có sẵn)
   */
  async authenticate(
    username: string,
    password: string,
    ckey: string,
    cvalue: string,
  ): Promise<string> {
    const loginUrl = `${this.gdtBaseUrl}/security-taxpayer/authenticate`;

    try {
      const response = await axios.post(
        loginUrl,
        { username, password, cvalue, ckey },
        { headers: this.headers, timeout: 20000 },
      );
      if (response.data?.token) {
        return response.data.token;
      }
      throw new Error('GDT authentication did not return a session token');
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message;
      throw new BadRequestException(`GDT login failed: ${errorMsg}`);
    }
  }

  /**
   * Lấy tên người nộp thuế từ GDT profile
   */
  async getTaxpayerName(token: string): Promise<string> {
    const profileUrl = `${this.gdtBaseUrl}/security-taxpayer/profile`;
    try {
      const response = await axios.get(profileUrl, {
        headers: {
          ...this.headers,
          Authorization: `Bearer ${token}`,
        },
        timeout: 15000,
      });
      return response.data?.name || '';
    } catch {
      this.logger.warn('Failed to fetch taxpayer profile name');
      return '';
    }
  }

  /**
   * Giải mã thời gian hết hạn từ JWT token của GDT
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const buffer = Buffer.from(parts[1], 'base64');
        const payload = JSON.parse(buffer.toString('utf-8'));
        if (payload?.exp) {
          return new Date(payload.exp * 1000);
        }
      }
    } catch {
      this.logger.warn('Failed to decode GDT token expiration');
    }
    return null;
  }

  /**
   * Kiểm tra token GDT đã hết hạn chưa (buffer 5 phút)
   */
  isTokenExpired(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const buffer = Buffer.from(parts[1], 'base64');
        const payload = JSON.parse(buffer.toString('utf-8'));
        if (payload?.exp) {
          const expTimeMs = payload.exp * 1000;
          const bufferTimeMs = 5 * 60 * 1000;
          return expTimeMs < Date.now() + bufferTimeMs;
        }
      }
    } catch {
      this.logger.warn('Error checking token expiration');
    }
    return true; // Default to expired if check fails
  }
}
