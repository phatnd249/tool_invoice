import { Router } from 'express';
import { UserController } from '../controllers/user.controller.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Protect all routes under user management to be ADMIN only
router.use(authenticateToken as any);
router.use(requireRole(['ADMIN']) as any);

router.get('/', UserController.getUsers as any);
router.post('/', UserController.createUser as any);
router.put('/:id', UserController.updateUser as any);
router.delete('/:id', UserController.deleteUser as any);

export default router;
