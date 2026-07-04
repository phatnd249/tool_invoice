import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { execSync } from 'child_process';
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

/**
 * Ensure database schema is up-to-date using Prisma db push.
 * This is a safety net in case initializeEnvironment didn't run it.
 */
export function ensureDatabaseSchema(): void {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('[Setup] DATABASE_URL not set, skipping schema check.');
    return;
  }

  // db push was already called in initializeEnvironment, but calling again
  // is idempotent and harmless. This handles the case where the database
  // already existed but schema was outdated.
  console.log('[Setup] Verifying database schema...');
  try {
    execSync('npx prisma db push --skip-generate', {
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
      timeout: 30000,
    });
    console.log('[Setup] Database schema is synchronized.');
  } catch (pushError: any) {
    console.error('[Setup] Failed to synchronize database schema:', pushError.stderr?.toString() || pushError.message);
  }
}

/**
 * Setup directories, copy template database if needed, and set environment variables.
 *
 * Đọc DATABASE_URL và INVOICES_DIR từ .env (đã load bởi dotenv.config()),
 * không hardcode đường dẫn như trước.
 */
export function initializeEnvironment(): { dbPath: string; invoicesDir: string } {
  // Read DATABASE_URL from .env (already loaded by dotenv.config in server.ts)
  // If path is relative, resolve it relative to the project root (where .env lives)
  let rawPath = (process.env.DATABASE_URL || 'file:./dev.db').replace(/^file:/, '');
  const dbPath = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(process.cwd(), rawPath);

  // Directory containing the database file
  const dbDir = path.dirname(dbPath);

  // Read INVOICES_DIR from .env, default to "invoices" folder next to database
  const invoicesDir = process.env.INVOICES_DIR
    ? path.resolve(process.env.INVOICES_DIR)
    : path.join(dbDir, 'invoices');

  console.log(`[Setup] Resolving environment paths:`);
  console.log(` - Database Path: ${dbPath}`);
  console.log(` - Invoices Directory: ${invoicesDir}`);

  // Create invoices directory if it doesn't exist
  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
  }

  // Copy template database if writable database doesn't exist
  if (!fs.existsSync(dbPath)) {
    // Create database directory if needed
    const dbDirAbsolute = path.dirname(dbPath);
    if (!fs.existsSync(dbDirAbsolute)) {
      fs.mkdirSync(dbDirAbsolute, { recursive: true });
    }

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

  // If database was just copied from template, it may have an outdated schema.
  // Force db push to ensure all tables exist.
  if (fs.existsSync(dbPath)) {
    try {
      execSync('npx prisma db push --skip-generate --accept-data-loss', {
        env: { ...process.env, DATABASE_URL: `file:${dbPath.replace(/\\/g, '/')}` },
        stdio: 'pipe',
        timeout: 30000,
      });
      console.log('[Setup] Database schema synchronized via db push.');
    } catch (pushError: any) {
      console.error('[Setup] Failed to synchronize database schema:', pushError.stderr?.toString() || pushError.message);
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
