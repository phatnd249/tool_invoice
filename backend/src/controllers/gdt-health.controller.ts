/**
 * GDT Health Check Controller
 *
 * Endpoint: GET /api/gdt/health
 * Yêu cầu xác thực, có thể optional token/mst để check API thực tế.
 */

import { Response } from 'express';
import prisma from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { gdtHealthService } from '../services/gdt-health.service.js';
import { createLogger } from '../logger/index.js';

const log = createLogger('GdtHealthController');

export class GdtHealthController {
  /**
   * GET /api/gdt/health
   *
   * Health check là **global** — tất cả company dùng chung hệ thống GDT,
   * kết quả được cache 30s.
   *
   * Query params:
   *   - companyId (optional): ID công ty để lấy token từ DB (dùng check token validity)
   *   - token     (optional): Token GDT truyền trực tiếp
   */
  static async check(req: AuthRequest, res: Response): Promise<void> {
    const { companyId, token: queryToken, mst: queryMst } = req.query;

    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    try {
      // ── Resolve token ──
      let gdtToken: string | null = queryToken as string | null;
      let mst: string = (queryMst as string) || '';

      // Nếu có companyId, lấy token từ DB
      if (!gdtToken && companyId) {
        const company = await prisma.company.findUnique({
          where: { id: Number(companyId) },
          select: { taxCode: true, token: true },
        });

        if (company) {
          mst = company.taxCode;
          gdtToken = company.token;

          // Kiểm tra quyền staff
          if (req.user.role !== 'ADMIN') {
            const hasAccess = await prisma.userCompany.findUnique({
              where: {
                userId_companyId: {
                  userId: req.user.id,
                  companyId: Number(companyId),
                },
              },
            });
            if (!hasAccess) {
              res.status(403).json({ error: 'Bạn không có quyền truy cập doanh nghiệp này.' });
              return;
            }
          }
        }
      }

      // Nếu không có companyId và không có token, thử lấy MST từ user's companies
      if (!gdtToken && !mst && req.user.role === 'ADMIN') {
        // Admin: có thể check mà không cần MST cụ thể
        mst = 'anonymous';
      } else if (!gdtToken && !mst) {
        // Staff: lấy company đầu tiên của user
        const userComp = await prisma.userCompany.findFirst({
          where: { userId: req.user.id },
          include: { company: { select: { taxCode: true, token: true } } },
        });
        if (userComp) {
          mst = userComp.company.taxCode;
          gdtToken = userComp.company.token;
        }
      }

      // ── Gọi health check ──
      log.info({ companyId, mst, hasToken: !!gdtToken }, 'Health check requested');
      const result = await gdtHealthService.checkAll(gdtToken, mst);

      // ── HTTP status dựa trên overall ──
      let httpStatus = 200;
      if (result.overall === 'degraded') httpStatus = 200; // Vẫn 200 để client đọc được data
      if (result.overall === 'unhealthy') httpStatus = 503; // Service Unavailable

      res.status(httpStatus).json(result);
    } catch (error: any) {
      log.error({ err: error }, 'Health check failed');
      res.status(500).json({
        overall: 'unhealthy',
        summary: `Lỗi khi kiểm tra GDT: ${error.message}`,
        checks: [],
        timestamp: new Date().toISOString(),
      });
    }
  }
}
