import { Router } from 'express';
import { MaSoThueController } from '../controllers/masothue.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

// Apply auth middleware for all routes in this router
router.use(authenticateToken as any);

router.get('/:taxCode', MaSoThueController.lookup);

export default router;
