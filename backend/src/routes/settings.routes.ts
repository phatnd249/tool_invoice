import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateToken as any);
router.use(requireRole(['ADMIN']) as any);

router.get('/', SettingsController.getSettings);
router.post('/', SettingsController.saveSettings);

export default router;
