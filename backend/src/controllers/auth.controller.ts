import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';

const authService = new AuthService();

export class AuthController {
  /**
   * POST /api/auth/token
   * Login using Tax Portal credentials (MST & Password), solve captcha with Gemini, and return GDT token
   */
  public static async authenticate(req: Request, res: Response): Promise<void> {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Missing required parameters: username, password' });
      return;
    }

    try {
      const token = await authService.loginAndGetToken(username, password);
      res.json({ token });
    } catch (error: any) {
      res.status(401).json({ error: 'Authentication failed', details: error.message });
    }
  }
}
