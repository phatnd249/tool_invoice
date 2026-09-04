import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import sharp from 'sharp';
import { GeminiClientService } from './gemini-client.service';

export interface GdtCaptcha {
  key: string;
  content: string; // SVG XML string
}

@Injectable()
export class CaptchaResolverService {
  private readonly logger = new Logger(CaptchaResolverService.name);

  private readonly captchaUrl =
    'https://hoadondientu.gdt.gov.vn/api/captcha';
  private readonly headers = {
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://hoadondientu.gdt.gov.vn/',
  };

  constructor(private readonly geminiClient: GeminiClientService) {}

  /**
   * Lấy captcha mới từ GDT (SVG + key)
   */
  async fetchCaptcha(): Promise<GdtCaptcha> {
    try {
      const response = await axios.get(this.captchaUrl, {
        headers: this.headers,
        timeout: 15000,
      });
      if (response.data?.key && response.data?.content) {
        return {
          key: response.data.key,
          content: response.data.content,
        };
      }
      throw new Error('Cấu trúc dữ liệu captcha GDT không hợp lệ');
    } catch (error: any) {
      this.logger.error(`Error fetching GDT captcha: ${error.message}`);
      throw error;
    }
  }

  /**
   * Chuyển SVG sang PNG buffer
   */
  async svgToPng(svgContent: string): Promise<Buffer> {
    try {
      return await sharp(Buffer.from(svgContent)).png().toBuffer();
    } catch (error: any) {
      this.logger.error(`Error converting SVG to PNG: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lấy captcha từ GDT và chuyển thành PNG base64 để hiển thị cho người dùng trên frontend.
   * Người dùng tự đọc mã và gửi lại { ckey, cvalue } cho luồng đăng nhập thủ công.
   */
  async fetchCaptchaAsPng(): Promise<{ ckey: string; captchaImage: string }> {
    const captcha = await this.fetchCaptcha();
    const pngBuffer = await this.svgToPng(captcha.content);
    return {
      ckey: captcha.key,
      captchaImage: `data:image/png;base64,${pngBuffer.toString('base64')}`,
    };
  }

  /**
   * Giải captcha: fetch → convert → solve
   * Trả về { ckey, cvalue } sẵn sàng cho GDT login
   */
  async resolve(apiKeyOverride?: string): Promise<{
    ckey: string;
    cvalue: string;
  }> {
    const captcha = await this.fetchCaptcha();
    const pngBuffer = await this.svgToPng(captcha.content);
    const cvalue = await this.geminiClient.solveCaptcha(
      pngBuffer,
      apiKeyOverride,
    );

    return {
      ckey: captcha.key,
      cvalue,
    };
  }
}
