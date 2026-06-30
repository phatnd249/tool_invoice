import { Request, Response } from 'express';
import prisma from '../utils/db.js';

export class SettingsController {
  /**
   * GET /api/settings
   * Fetch settings from the DB
   */
  public static async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const settings = await prisma.setting.findMany();
      const settingsMap = settings.reduce((acc, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {} as Record<string, string>);

      // Fallback to process.env.GEMINI_API_KEY if not stored in DB
      if (!settingsMap.geminiApiKey && process.env.GEMINI_API_KEY) {
        settingsMap.geminiApiKey = process.env.GEMINI_API_KEY;
      }

      res.json(settingsMap);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to retrieve settings', details: error.message });
    }
  }

  /**
   * POST /api/settings
   * Save setting values
   */
  public static async saveSettings(req: Request, res: Response): Promise<void> {
    const body = req.body;
    try {
      const keys = Object.keys(body);
      for (const key of keys) {
        await prisma.setting.upsert({
          where: { key },
          update: { value: String(body[key]) },
          create: { key, value: String(body[key]) },
        });

        // Sync with environment variable too for backend processes relying on it
        if (key === 'geminiApiKey') {
          process.env.GEMINI_API_KEY = String(body[key]);
        }
      }
      res.json({ message: 'Settings saved successfully' });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to save settings', details: error.message });
    }
  }
}
