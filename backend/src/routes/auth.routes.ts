import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';

const router = Router();

// Route to get token using GDT portal credentials
router.post('/token', AuthController.authenticate);

// Route to fetch a new captcha SVG from GDT
router.get('/captcha', AuthController.getCaptcha);

export default router;
