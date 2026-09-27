import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class GeminiClientService {
  private readonly logger = new Logger(GeminiClientService.name);
  private client: GoogleGenerativeAI | null = null;

  constructor(private readonly config: ConfigService) { }

  getClient(apiKeyOverride?: string): GoogleGenerativeAI {
    const apiKey = apiKeyOverride || this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'Gemini API key is not configured. Please set GEMINI_API_KEY in .env',
      );
    }
    if (!this.client || apiKeyOverride) {
      this.client = new GoogleGenerativeAI(apiKey);
    }
    return this.client;
  }

  /**
   * Giải ảnh captcha bằng Gemini Flash (mặc định gemini-3.6-flash)
   */
  async solveCaptcha(
    imageBuffer: Buffer,
    apiKeyOverride?: string,
  ): Promise<string> {
    const client = this.getClient(apiKeyOverride);
    const primaryModel =
      this.config.get<string>('GEMINI_MODEL') || 'gemini-3.6-flash';

    const prompt =
      'Extract the alphanumeric characters in this captcha image. Return only the captcha characters in uppercase, without any spaces, punctuation, or extra text.';

    const modelsToTry = Array.from(
      new Set([
        primaryModel,
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
      ]),
    );

    let fallbackResult = '';
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        const model = client.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: imageBuffer.toString('base64'),
              mimeType: 'image/png',
            },
          },
        ]);

        const responseText = result.response.text();
        const cleaned = responseText
          .replace(/[^a-zA-Z0-9]/g, '')
          .toUpperCase()
          .trim();

        if (cleaned.length === 6) {
          return cleaned;
        }
        fallbackResult = cleaned;
      } catch (err: any) {
        lastError = err;
        this.logger.warn(
          `Model ${modelName} gặp lỗi khi giải captcha: ${err.message}. Đang thử model tiếp theo...`,
        );
      }
    }

    if (fallbackResult) {
      return fallbackResult;
    }

    throw (
      lastError ||
      new InternalServerErrorException('Không thể giải captcha bằng Gemini')
    );
  }
}
