import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class GeminiClientService {
  private client: GoogleGenerativeAI | null = null;

  constructor(private readonly config: ConfigService) {}

  getClient(apiKeyOverride?: string): GoogleGenerativeAI {
    const apiKey =
      apiKeyOverride || this.config.get<string>('GEMINI_API_KEY');
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
   * Giải ảnh captcha bằng Gemini Flash
   */
  async solveCaptcha(
    imageBuffer: Buffer,
    apiKeyOverride?: string,
  ): Promise<string> {
    const client = this.getClient(apiKeyOverride);
    const modelName =
      this.config.get<string>('GEMINI_MODEL') || 'gemini-3.6-flash';
    const model = client.getGenerativeModel({ model: modelName });

    const prompt =
      'Extract the alphanumeric characters in this captcha image. Return only the captcha characters in uppercase, without any spaces, punctuation, or extra text.';

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
    // Clean result: keep only alphanumeric characters, uppercase
    return responseText.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
  }
}
