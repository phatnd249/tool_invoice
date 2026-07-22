import { Router } from 'express';
import { GdtHealthController } from '../controllers/gdt-health.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

// Yêu cầu xác thực — health check cần user để resolve token company
router.use(authenticateToken as any);

// GET /api/gdt/health
// Query params: companyId, token, mst (all optional)
router.get('/health', GdtHealthController.check as any);

export default router;
