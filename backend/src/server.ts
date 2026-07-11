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
import { PUBLIC_DIR, FRONTEND_DIST } from './utils/paths.js';
import prisma from './utils/db.js';
import invoiceRoutes from './routes/invoice.routes.js';
import authRoutes from './routes/auth.routes.js';
import companyRoutes from './routes/company.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import userRoutes from './routes/user.routes.js';
import feedbackRoutes from './routes/feedback.routes.js';
import masothueRoutes from './routes/masothue.routes.js';
import scheduleRoutes from './routes/schedule.routes.js';
import { AuthController } from './controllers/auth.controller.js';
import { schedulerService } from './services/scheduler.service.js';
import { handleElectronIpcMessage } from './utils/electron-ipc.js';

if (process.send) {
  process.on('message', (message: any) => {
    handleElectronIpcMessage(message);
  });
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
app.use('/api/schedules', scheduleRoutes);

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
// Priority:
//   1. backend/public/ (production build, copied by npm run build)
//   2. frontend/dist/ (dev mode, build output)
const publicPath = PUBLIC_DIR;
const frontendDistPath = FRONTEND_DIST;

let staticPath: string | null = null;

if (isProduction && fs.existsSync(publicPath)) {
  // Production: frontend was copied to backend/public/ during build
  staticPath = publicPath;
  console.log(`[Server] Serving frontend from: ${staticPath}`);
} else if (fs.existsSync(frontendDistPath)) {
  // Dev mode: frontend built to frontend/dist/
  staticPath = frontendDistPath;
  console.log(`[Server] Serving frontend from: ${staticPath}`);
} else if (fs.existsSync(publicPath)) {
  // Fallback: backend/public/ (may contain legacy index.html)
  staticPath = publicPath;
  console.warn(`[Server] Frontend build not found at ${frontendDistPath}, falling back to public/.`);
} else {
  console.warn(`[Server] WARNING: No frontend build found. Running API-only server.`);
}

if (staticPath) {
  app.use(express.static(staticPath));
  // Wildcard fallback to serve index.html for SPA routing
  app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

// Find a free port and start server
findFreePort(Number(PORT)).then(async (freePort) => {
  // Seed initial administrator account if needed
  await AuthController.seedInitialAdmin();
  await schedulerService.startAll();

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
