import axios from 'axios';
import sharp from 'sharp';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GdtCaptcha {
  key: string;
  content: string; // SVG XML string
}

export class CaptchaService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  /**
   * Fetch a new Captcha from the Tax Portal
   */
  public async getCaptcha(): Promise<GdtCaptcha> {
    const url = 'https://hoadondientu.gdt.gov.vn/api/captcha';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://hoadondientu.gdt.gov.vn/',
    };

    try {
      const response = await axios.get(url, { headers, timeout: 15000 });
      if (response.data && response.data.key && response.data.content) {
        return {
          key: response.data.key,
          content: response.data.content,
        };
      }
      throw new Error('Invalid GDT captcha response structure.');
    } catch (error: any) {
      console.error('[CaptchaService] Error fetching GDT captcha:', error.message);
      throw error;
    }
  }

  /**
   * Convert raw SVG XML string to PNG Buffer using sharp
   */
  public async convertSvgToPng(svgContent: string): Promise<Buffer> {
    try {
      return await sharp(Buffer.from(svgContent))
        .png()
        .toBuffer();
    } catch (error: any) {
      console.error('[CaptchaService] Error converting SVG to PNG:', error.message);
      throw error;
    }
  }

  public async solveCaptcha(imageBuffer: Buffer, apiKeyOverride?: string): Promise<string> {
    let client = this.genAI;
    if (apiKeyOverride) {
      client = new GoogleGenerativeAI(apiKeyOverride);
    }

    if (!client) {
      throw new Error('Gemini API is not initialized. Please configure Gemini API Key.');
    }

    try {
      const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
      
      const prompt = 'Extract the alphanumeric characters in this captcha image. Return only the captcha characters in uppercase, without any spaces, punctuation, or extra text.';
      
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
      // Clean result: keep only alphanumeric characters, uppercase them
      const solvedText = responseText.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
      
      console.log(`[CaptchaService] Gemini solved captcha: "${solvedText}"`);
      return solvedText;
    } catch (error: any) {
      console.error('[CaptchaService] Error calling Gemini API for OCR:', error.message);
      throw error;
    }
  }
}
