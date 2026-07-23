import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

// ── SSE stream endpoint: đặt TRƯỚC middleware authen vì EventSource không hỗ trợ custom headers ──
// Token được xác thực qua query param ?token=... hoặc ?jobId&token=...
router.get('/download/stream/:jobId', InvoiceController.downloadInvoicesStream as any);

// ── Các route còn lại yêu cầu Bearer token ──
router.use(authenticateToken as any);

// Route to check if invoices already exist for a company and date range
router.post('/check-existing', InvoiceController.checkExistingInvoices as any);

// Route to trigger querying and downloading invoices (returns jobId)
router.post('/download', InvoiceController.downloadInvoices);

// Route to get list of download jobs (active + recent)
router.get('/download/jobs', InvoiceController.getDownloadJobs as any);

// Route to get detail of a specific download job
router.get('/download/jobs/:id', InvoiceController.getDownloadJobById as any);

// Route to cancel a running download job
router.post('/download/jobs/:id/cancel', InvoiceController.cancelDownloadJob as any);

// Route to get audit logs and download stats history
// Đặt trước /download/jobs/:id để tránh conflict
router.get('/download-history', InvoiceController.getDownloadHistory as any);

// Route to get all saved invoices with filters
router.get('/', InvoiceController.getInvoices);

// Route to export selected invoices to styled Excel sheet
router.post('/export', InvoiceController.exportInvoices);

// Route to export selected invoices to Module 7 report
router.post('/export-module7', InvoiceController.exportModule7);

// Route to download XML of a specific invoice
router.get('/:id/xml', InvoiceController.downloadXml);

// Route to download ZIP of a specific invoice
router.get('/:id/zip', InvoiceController.downloadZip as any);

// Route to download generated PDF of a specific invoice
router.get('/:id/pdf', InvoiceController.downloadPdf as any);

// Route to preview invoice HTML from its ZIP file
router.get('/:id/preview', InvoiceController.previewInvoice as any);

export default router;
