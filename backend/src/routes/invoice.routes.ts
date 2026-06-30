import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateToken as any);

// Route to trigger querying and downloading invoices
router.post('/download', InvoiceController.downloadInvoices);

// Route to get audit logs and download stats history
router.get('/download-history', InvoiceController.getDownloadHistory as any);

// Route to get all saved invoices with filters
router.get('/', InvoiceController.getInvoices);

// Route to export selected invoices to styled Excel sheet
router.post('/export', InvoiceController.exportInvoices);

// Route to download XML of a specific invoice
router.get('/:id/xml', InvoiceController.downloadXml);

// Route to download ZIP of a specific invoice
router.get('/:id/zip', InvoiceController.downloadZip);

export default router;
