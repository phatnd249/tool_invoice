import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller.js';

const router = Router();

// Route to trigger querying and downloading invoices
router.post('/download', InvoiceController.downloadInvoices);

// Route to get all saved invoices with filters
router.get('/', InvoiceController.getInvoices);

// Route to export selected invoices to styled Excel sheet
router.post('/export', InvoiceController.exportInvoices);

// Route to download XML of a specific invoice
router.get('/:id/xml', InvoiceController.downloadXml);

// Route to download ZIP of a specific invoice
router.get('/:id/zip', InvoiceController.downloadZip);

export default router;
