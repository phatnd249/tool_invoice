import { Router } from 'express';
import { ScheduleController } from '../controllers/schedule.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateToken as any);

router.get('/', ScheduleController.list);
router.post('/', ScheduleController.create);
router.patch('/:id', ScheduleController.toggle);
router.delete('/:id', ScheduleController.remove);

export default router;
