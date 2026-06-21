import axios from 'axios';
import { CaptchaService } from './captcha.service.js';

const captchaService = new CaptchaService();

export class AuthService {
  /**
   * Check if a GDT JWT Token is expired or close to expiration (within 5 minutes)
   */
  public isTokenExpired(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payloadB64 = parts[1];
        const buffer = Buffer.from(payloadB64, 'base64');
        const payload = JSON.parse(buffer.toString('utf-8'));
        
        if (payload && payload.exp) {
          const expTimeMs = payload.exp * 1000;
          // Consider expired if it expires in less than 5 minutes
          const bufferTimeMs = 5 * 60 * 1000;
          return expTimeMs < Date.now() + bufferTimeMs;
        }
      }
    } catch (error) {
      console.error('[AuthService] Error checking token expiration:', error);
    }
    return true; // Default to expired if check fails
  }

  /**
   * Log in to the Tax Portal and retrieve the session token
   * @param username Business tax code or username
   * @param password Account lookup password
   * @param maxRetries Maximum retry attempts (default: 3)
   */
  public async loginAndGetToken(
    username: string, 
    password: string, 
    maxRetries: number = 3
  ): Promise<string> {
    const loginUrl = 'https://hoadondientu.gdt.gov.vn/api/security-taxpayer/authenticate';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://hoadondientu.gdt.gov.vn/',
    };

    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      console.log(`[AuthService] Login attempt ${attempt}/${maxRetries} for MST ${username}...`);
      
      try {
        // Step 1: Fetch captcha SVG and key
        const captcha = await captchaService.getCaptcha();

        // Step 2: Convert SVG to PNG
        const pngBuffer = await captchaService.convertSvgToPng(captcha.content);

        // Step 3: Solve Captcha using Gemini API
        const cvalue = await captchaService.solveCaptcha(pngBuffer);

        if (!cvalue || cvalue.length !== 6) {
          console.warn(`[AuthService] Resolved captcha "${cvalue}" is invalid length (expected 6 characters). Retrying...`);
          continue;
        }

        // Step 4: GDT Authenticate Request
        const payload = {
          username,
          password,
          cvalue,
          ckey: captcha.key,
        };

        const response = await axios.post(loginUrl, payload, { headers, timeout: 20000 });
        
        if (response.data && response.data.token) {
          console.log(`[AuthService] Login successful on attempt ${attempt}. Token obtained.`);
          return response.data.token;
        }

        throw new Error('GDT authentication did not return a session token.');
      } catch (error: any) {
        const errorData = error.response?.data;
        const errorMsg = errorData?.message || errorData?.error || error.message;
        console.error(`[AuthService] Login attempt ${attempt} failed. Details:`, errorMsg);
        
        // Fail fast if credentials are wrong (not a captcha mistake)
        const isCredentialError = typeof errorMsg === 'string' && (
          errorMsg.toLowerCase().includes('tài khoản') ||
          errorMsg.toLowerCase().includes('mật khẩu') ||
          errorMsg.toLowerCase().includes('không đúng') ||
          errorMsg.toLowerCase().includes('không tồn tại')
        );

        if (isCredentialError) {
          throw new Error(`Invalid credentials: ${errorMsg}`);
        }

        if (attempt >= maxRetries) {
          throw new Error(`Failed to authenticate with GDT after ${maxRetries} attempts. Last error: ${errorMsg}`);
        }
      }
    }
    
    throw new Error('Authentication failed.');
  }
}
