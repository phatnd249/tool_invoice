import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import prisma from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.middleware.js';

const authService = new AuthService();

export class CompanyController {
  /**
   * GET /api/companies
   * Fetch all companies (filtered by user access for staff)
   */
  public static async getCompanies(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Yêu cầu xác thực.' });
        return;
      }

      let companies;
      if (req.user.role === 'ADMIN') {
        companies = await prisma.company.findMany({
          orderBy: { createdAt: 'desc' }
        });
      } else {
        // STAFF: only return companies assigned to them
        companies = await prisma.company.findMany({
          where: {
            users: {
              some: {
                userId: req.user.id
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        });
      }
      res.json(companies);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to retrieve companies', details: error.message });
    }
  }

  /**
   * POST /api/companies
   * Add new company and verify login
   */
  public static async createCompany(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user || req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này.' });
      return;
    }

    const { taxCode, name, lookupPassword, loginMode = 'AUTO', ckey, cvalue } = req.body;

    if (!taxCode || !lookupPassword) {
      res.status(400).json({ error: 'Mã số thuế và mật khẩu tra cứu là bắt buộc.' });
      return;
    }

    try {
      // Check if company already exists
      const existing = await prisma.company.findUnique({
        where: { taxCode }
      });
      if (existing) {
        res.status(400).json({ error: `Công ty có mã số thuế ${taxCode} đã tồn tại.` });
        return;
      }

      let token = '';

      if (loginMode === 'AUTO') {
        // Fetch global Gemini API key
        const geminiSetting = await prisma.setting.findUnique({
          where: { key: 'geminiApiKey' }
        });
        const apiKey = geminiSetting?.value || process.env.GEMINI_API_KEY;
        if (!apiKey) {
          res.status(400).json({ error: 'Vui lòng cấu hình Gemini API Key trước khi sử dụng chế độ tự động.' });
          return;
        }

        // Authenticate with GDT
        token = await authService.loginAndGetToken(taxCode, lookupPassword, apiKey);
      } else {
        // MANUAL login mode
        if (!ckey || !cvalue) {
          res.status(400).json({ error: 'Thiếu thông tin Captcha cho chế độ đăng nhập thủ công.' });
          return;
        }
        token = await authService.loginManual(taxCode, lookupPassword, ckey, cvalue);
      }

      const tokenExpiredAt = authService.getTokenExpiration(token);
      const resolvedName = await authService.getTaxpayerName(token) || taxCode;

      const company = await prisma.company.create({
        data: {
          taxCode,
          name: resolvedName,
          lookupPassword,
          loginMode,
          token,
          tokenExpiredAt,
        }
      });

      res.json(company);
    } catch (error: any) {
      res.status(400).json({ error: 'Xác thực tài khoản với Tổng cục Thuế thất bại.', details: error.message });
    }
  }

  /**
   * PUT /api/companies/:id
   * Update company details
   */
  public static async updateCompany(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user || req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này.' });
      return;
    }

    const { id } = req.params;
    const { name, lookupPassword, loginMode } = req.body;

    try {
      const company = await prisma.company.update({
        where: { id: Number(id) },
        data: {
          name,
          lookupPassword,
          loginMode,
        }
      });
      res.json(company);
    } catch (error: any) {
      res.status(500).json({ error: 'Cập nhật thông tin công ty thất bại.', details: error.message });
    }
  }

  /**
   * DELETE /api/companies/:id
   * Delete company (Prisma cascade deletes schedules)
   */
  public static async deleteCompany(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user || req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này.' });
      return;
    }

    const { id } = req.params;

    try {
      await prisma.company.delete({
        where: { id: Number(id) }
      });
      res.json({ message: 'Đã xóa doanh nghiệp thành công.' });
    } catch (error: any) {
      res.status(500).json({ error: 'Xóa doanh nghiệp thất bại.', details: error.message });
    }
  }

  /**
   * POST /api/companies/:id/refresh
   * Refresh token for AUTO mode companies
   */
  public static async refreshToken(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    try {
      if (req.user.role !== 'ADMIN') {
        const hasAccess = await prisma.userCompany.findUnique({
          where: {
            userId_companyId: {
              userId: req.user.id,
              companyId: Number(id)
            }
          }
        });
        if (!hasAccess) {
          res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này đối với doanh nghiệp này.' });
          return;
        }
      }

      const company = await prisma.company.findUnique({
        where: { id: Number(id) }
      });

      if (!company) {
        res.status(404).json({ error: 'Không tìm thấy doanh nghiệp.' });
        return;
      }

      if (company.loginMode !== 'AUTO') {
        res.status(400).json({ error: 'Chỉ có thể tự động làm mới mã xác thực đối với doanh nghiệp có chế độ Đăng nhập Tự động.' });
        return;
      }

      const geminiSetting = await prisma.setting.findUnique({
        where: { key: 'geminiApiKey' }
      });
      const apiKey = geminiSetting?.value || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(400).json({ error: 'Vui lòng cấu hình Gemini API Key trước.' });
        return;
      }

      const token = await authService.loginAndGetToken(company.taxCode, company.lookupPassword, apiKey);
      const tokenExpiredAt = authService.getTokenExpiration(token);
      const resolvedName = await authService.getTaxpayerName(token) || company.name;

      const updated = await prisma.company.update({
        where: { id: company.id },
        data: { token, tokenExpiredAt, name: resolvedName }
      });

      res.json({ token: updated.token, tokenExpiredAt: updated.tokenExpiredAt });
    } catch (error: any) {
      res.status(502).json({ error: 'Không thể tự động gia hạn token với Tổng cục Thuế.', details: error.message });
    }
  }

  /**
   * POST /api/companies/:id/login-manual
   * Login manually for MANUAL mode companies
   */
  public static async loginManual(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { ckey, cvalue } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    if (!ckey || !cvalue) {
      res.status(400).json({ error: 'Thiếu mã captcha xác thực.' });
      return;
    }

    try {
      if (req.user.role !== 'ADMIN') {
        const hasAccess = await prisma.userCompany.findUnique({
          where: {
            userId_companyId: {
              userId: req.user.id,
              companyId: Number(id)
            }
          }
        });
        if (!hasAccess) {
          res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này đối với doanh nghiệp này.' });
          return;
        }
      }

      const company = await prisma.company.findUnique({
        where: { id: Number(id) }
      });

      if (!company) {
        res.status(404).json({ error: 'Không tìm thấy doanh nghiệp.' });
        return;
      }

      const token = await authService.loginManual(company.taxCode, company.lookupPassword, ckey, cvalue);
      const tokenExpiredAt = authService.getTokenExpiration(token);
      const resolvedName = await authService.getTaxpayerName(token) || company.name;

      const updated = await prisma.company.update({
        where: { id: company.id },
        data: { token, tokenExpiredAt, name: resolvedName }
      });

      res.json({ token: updated.token, tokenExpiredAt: updated.tokenExpiredAt });
    } catch (error: any) {
      res.status(400).json({ error: 'Đăng nhập thủ công thất bại.', details: error.message });
    }
  }
}
