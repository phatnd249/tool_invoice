import dotenv from 'dotenv';
// Load environment variables first
dotenv.config();

// Initialize DB URL and workspace folders dynamically before loading DB
import { initializeEnvironment, findFreePort, ensureDatabaseSchema } from './utils/setup.js';
initializeEnvironment();
ensureDatabaseSchema();

import express, { Request, Response } from 'express';
import cors from 'cors';
import open from 'open';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from './utils/db.js';
import invoiceRoutes from './routes/invoice.routes.js';
import authRoutes from './routes/auth.routes.js';
import companyRoutes from './routes/company.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import userRoutes from './routes/user.routes.js';
import feedbackRoutes from './routes/feedback.routes.js';
import masothueRoutes from './routes/masothue.routes.js';
import { AuthController } from './controllers/auth.controller.js';

let _dirname = '';
try {
  _dirname = __dirname;
} catch {
  _dirname = path.dirname(fileURLToPath(import.meta.url));
}

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production' || typeof (process as any).pkg !== 'undefined';

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/invoices', invoiceRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/feedbacks', feedbackRoutes);
app.use('/api/masothue', masothueRoutes);

// Basic health check route
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'OK',
      message: 'Server and Database are healthy (TypeScript)',
      timestamp: new Date()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Serve React SPA Frontend static files
// Note: We traverse relatively based on pkg (/snapshot) or standard build outputs
const frontendDistPath = typeof (process as any).pkg !== 'undefined'
  ? path.join(_dirname, '../../frontend/dist')
  : path.join(_dirname, '../../../frontend/dist');

if (fs.existsSync(frontendDistPath)) {
  console.log(`[Server] Serving frontend static assets from: ${frontendDistPath}`);
  app.use(express.static(frontendDistPath));

  // Wildcard fallback to serve index.html for SPA routing
  app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  console.warn(`[Server] WARNING: Frontend build path not found at: ${frontendDistPath}. Running API-only server.`);
  // Fallback to serving public/ directory if it exists
  const publicPath = path.join(_dirname, '../public');
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }
}

// Find a free port and start server
findFreePort(Number(PORT)).then(async (freePort) => {
  // Seed initial administrator account if needed
  await AuthController.seedInitialAdmin();

  app.listen(freePort, () => {
    const localUrl = `http://localhost:${freePort}`;
    console.log(`🚀 Backend server (TypeScript) is running at ${localUrl}`);

    // Auto-open browser in production mode
    if (isProduction) {
      console.log(`[Server] Auto-opening browser at ${localUrl}...`);
      open(localUrl).catch((err) => {
        console.error('[Server] Failed to open browser automatically:', err.message);
      });
    }
  });
});
