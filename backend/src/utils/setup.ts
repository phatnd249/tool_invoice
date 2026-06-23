import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import { fileURLToPath } from 'url';

let _dirname = '';
try {
  _dirname = __dirname;
} catch {
  _dirname = path.dirname(fileURLToPath(import.meta.url));
}

// Helper to check if port is in use
function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false); // In use
    });
    server.once('listening', () => {
      server.close();
      resolve(true); // Free
    });
    server.listen(port, '127.0.0.1');
  });
}

// Find a free port starting from startPort
export async function findFreePort(startPort: number): Promise<number> {
  let port = startPort;
  while (!(await checkPort(port))) {
    port++;
  }
  return port;
}

// Setup directories and copy database template
export function initializeEnvironment(): { dbPath: string; invoicesDir: string } {
  // Use os.homedir() to resolve the user's home directory
  const homeDir = os.homedir();
  const appDataDir = path.join(homeDir, 'InvoiceDownloader');
  const invoicesDir = path.join(appDataDir, 'invoices');
  const dbPath = path.join(appDataDir, 'database.db');

  console.log(`[Setup] Resolving environment paths:`);
  console.log(` - App Workspace: ${appDataDir}`);
  console.log(` - Invoices Directory: ${invoicesDir}`);
  console.log(` - Database Path: ${dbPath}`);

  // Create workspace directories
  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
  }
  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
  }

  // Copy template database if writable database doesn't exist
  if (!fs.existsSync(dbPath)) {
    // Resolve template database path
    // We check multiple locations depending on whether we run standalone, pkg, or inside developer workspace
    const possibleTemplates = [
      path.join(_dirname, '../../prisma/dev.db'),
      path.join(_dirname, '../prisma/dev.db'),
      path.join(process.cwd(), 'prisma/dev.db'),
      path.join(process.cwd(), 'backend/prisma/dev.db'),
    ];

    let templateFound = false;
    for (const templatePath of possibleTemplates) {
      if (fs.existsSync(templatePath)) {
        try {
          fs.copyFileSync(templatePath, dbPath);
          console.log(`[Setup] Successfully copied template database from: ${templatePath}`);
          templateFound = true;
          break;
        } catch (err) {
          console.error(`[Setup] Failed to copy database from ${templatePath}:`, err);
        }
      }
    }

    if (!templateFound) {
      console.warn('[Setup] WARNING: SQLite template database not found. Prisma may fail to initialize unless migrated.');
    }
  }

  // Set environment variables dynamically so Prisma and controllers use them
  process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;
  process.env.INVOICES_DIR = invoicesDir;

  // Resolve PRISMA_QUERY_ENGINE_LIBRARY dynamically on physical disk next to executable when packaged
  if (typeof (process as any).pkg !== 'undefined') {
    const execDir = path.dirname(process.execPath);
    const clientDir = path.join(execDir, 'node_modules/.prisma/client');
    if (fs.existsSync(clientDir)) {
      try {
        const files = fs.readdirSync(clientDir);
        const engineFile = files.find(f => (f.startsWith('libquery_engine-') || f.startsWith('query_engine-')) && f.endsWith('.node'));
        if (engineFile) {
          const enginePath = path.join(clientDir, engineFile);
          process.env.PRISMA_QUERY_ENGINE_LIBRARY = enginePath;
          console.log(`[Setup] Set PRISMA_QUERY_ENGINE_LIBRARY dynamically to: ${enginePath}`);
        }
      } catch (err) {
        console.error('[Setup] Failed to scan native Prisma client folder:', err);
      }
    }
  }

  return { dbPath, invoicesDir };
}
