import axios from 'axios';
import { CaptchaService } from './captcha.service.js';
import { createLogger } from '../logger/index.js';

const captchaService = new CaptchaService();
const log = createLogger('AuthService');

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
      log.error({ err: error }, 'Error checking token expiration');
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
    geminiApiKey?: string,
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
      log.info({ mst: username, attempt, maxRetries }, 'Login attempt');
      
      try {
        // Step 1: Fetch captcha SVG and key
        const captcha = await captchaService.getCaptcha();

        // Step 2: Convert SVG to PNG
        const pngBuffer = await captchaService.convertSvgToPng(captcha.content);

        // Step 3: Solve Captcha using Gemini API
        const cvalue = await captchaService.solveCaptcha(pngBuffer, geminiApiKey);

        if (!cvalue || cvalue.length !== 6) {
          log.warn({ cvalue, length: cvalue?.length }, 'Resolved captcha invalid length, retrying...');
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
          log.info({ mst: username, attempt }, 'Login successful. Token obtained.');
          return response.data.token;
        }

        throw new Error('GDT authentication did not return a session token.');
      } catch (error: any) {
        const errorData = error.response?.data;
        const errorMsg = errorData?.message || errorData?.error || error.message;
        log.error({ mst: username, attempt, errorMsg }, 'Login attempt failed');
        
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

  /**
   * Decode the GDT JWT Token expiration date
   */
  public getTokenExpiration(token: string): Date | null {
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payloadB64 = parts[1];
        const buffer = Buffer.from(payloadB64, 'base64');
        const payload = JSON.parse(buffer.toString('utf-8'));
        if (payload && payload.exp) {
          return new Date(payload.exp * 1000);
        }
      }
    } catch (error) {
      log.error({ err: error }, 'Error decoding token expiration');
    }
    return null;
  }

  /**
   * Fetch a new Captcha key and content
   */
  public async getNewCaptcha(): Promise<{ key: string; content: string }> {
    return await captchaService.getCaptcha();
  }

  /**
   * Log in to the Tax Portal manually using credentials and pre-solved captcha
   */
  public async loginManual(
    username: string,
    password: string,
    ckey: string,
    cvalue: string
  ): Promise<string> {
    const loginUrl = 'https://hoadondientu.gdt.gov.vn/api/security-taxpayer/authenticate';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://hoadondientu.gdt.gov.vn/',
    };

    const payload = {
      username,
      password,
      cvalue,
      ckey,
    };

    try {
      const response = await axios.post(loginUrl, payload, { headers, timeout: 20000 });
      if (response.data && response.data.token) {
        return response.data.token;
      }
      throw new Error('GDT authentication did not return a session token.');
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMsg = errorData?.message || errorData?.error || error.message;
      log.error({ mst: username, errorMsg }, 'Manual login failed');
      throw new Error(errorMsg);
    }
  }

  /**
   * Fetch company name from hoadondientu profile
   */
  public async getTaxpayerName(token: string): Promise<string> {
    const profileUrl = 'https://hoadondientu.gdt.gov.vn/api/security-taxpayer/profile';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0',
      'Authorization': `Bearer ${token}`,
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://hoadondientu.gdt.gov.vn/',
    };

    try {
      const response = await axios.get(profileUrl, { headers, timeout: 15000 });
      if (response.data && response.data.name) {
        return response.data.name;
      }
    } catch (error: any) {
      log.error({ err: error.message }, 'Failed to fetch taxpayer profile name');
    }
    return '';
  }
}
