import { Router } from 'express';
import { FeedbackController } from '../controllers/feedback.controller.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Require basic authentication for all endpoints
router.use(authenticateToken as any);

// Post feedback is available to anyone authenticated (Staff or Admin)
router.post('/', FeedbackController.submitFeedback as any);

// Admin-only review endpoints
router.get('/', requireRole(['ADMIN']) as any, FeedbackController.getFeedbacks as any);
router.put('/:id', requireRole(['ADMIN']) as any, FeedbackController.updateFeedbackStatus as any);

export default router;
