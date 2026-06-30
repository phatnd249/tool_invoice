import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.middleware.js';

const JWT_SECRET = process.env.JWT_SECRET || 'invoice_downloader_secret_key_12984712';

export class AuthController {
  /**
   * POST /api/auth/login
   */
  public static async login(req: Request, res: Response): Promise<void> {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Tên đăng nhập và mật khẩu là bắt buộc.' });
      return;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { username: username.trim() }
      });

      if (!user) {
        res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
        return;
      }

      if (!user.isActive) {
        res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.' });
        return;
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
        return;
      }

      // Sign JWT token
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '1d' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    } catch (error: any) {
      console.error('[AuthController] Login error:', error);
      res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống.' });
    }
  }

  /**
   * GET /api/auth/me
   */
  public static async me(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          companies: {
            select: {
              companyId: true
            }
          }
        }
      });

      if (!user) {
        res.status(404).json({ error: 'Người dùng không tồn tại.' });
        return;
      }

      if (!user.isActive) {
        res.status(403).json({ error: 'Tài khoản đã bị khóa.' });
        return;
      }

      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        assignedCompanies: user.companies.map(uc => uc.companyId)
      });
    } catch (error: any) {
      console.error('[AuthController] Profile fetch error:', error);
      res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống.' });
    }
  }

  /**
   * Helper to seed the initial admin account if users table is empty
   */
  public static async seedInitialAdmin(): Promise<void> {
    try {
      const userCount = await prisma.user.count();
      if (userCount === 0) {
        const defaultAdminUsername = 'admin';
        const defaultAdminPassword = 'adminpassword';
        const hashedPassword = await bcrypt.hash(defaultAdminPassword, 10);

        await prisma.user.create({
          data: {
            username: defaultAdminUsername,
            password: hashedPassword,
            role: 'ADMIN',
            isActive: true
          }
        });
        console.log(`[Setup] Initialized database with default admin account.`);
        console.log(`[Setup] Username: ${defaultAdminUsername}`);
        console.log(`[Setup] Password: ${defaultAdminPassword}`);
      }
    } catch (error) {
      console.error('[Setup] Failed to seed initial admin account:', error);
    }
  }
}
