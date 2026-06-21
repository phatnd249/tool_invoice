import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';

const router = Router();

// Route to get token using GDT portal credentials
router.post('/token', AuthController.authenticate);

export default router;
