import { Router } from 'express';
import { CompanyController } from '../controllers/company.controller.js';

const router = Router();

router.get('/', CompanyController.getCompanies);
router.post('/', CompanyController.createCompany);
router.put('/:id', CompanyController.updateCompany);
router.delete('/:id', CompanyController.deleteCompany);
router.post('/:id/refresh', CompanyController.refreshToken);
router.post('/:id/login-manual', CompanyController.loginManual);

export default router;
