import { Router } from 'express';
import { CompanyController } from '../controllers/company.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateToken as any);

router.get('/', CompanyController.getCompanies);
router.post('/', CompanyController.createCompany);
router.put('/:id', CompanyController.updateCompany);
router.delete('/:id', CompanyController.deleteCompany);
router.post('/:id/refresh', CompanyController.refreshToken);
router.post('/:id/login-manual', CompanyController.loginManual);
router.put('/:id/sync-info', CompanyController.syncCompanyInfo as any);

export default router;
