import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Resolve __dirname safely across all runtimes:
 *   - tsx (ESM):  import.meta.url → file path
 *   - node CJS:   __dirname available natively
 *   - esbuild CJS: __dirname natively (bundled)
 */
export const SCRIPT_DIR: string = (() => {
  try {
    return __dirname;
  } catch {
    return path.dirname(fileURLToPath(import.meta.url));
  }
})();

/**
 * Application root directory (backend/ folder).
 *
 * Resolved by walking up from SCRIPT_DIR until we find
 * prisma/schema.prisma or a directory named "backend".
 *
 * Works correctly in both:
 *   - Dev (tsx):    SCRIPT_DIR = .../backend/src/utils/  → walk up 2 levels
 *   - Production:   SCRIPT_DIR = .../backend/dist/        → walk up 1 level
 */
export const APP_ROOT: string = (() => {
  let dir = SCRIPT_DIR;
  for (let i = 0; i < 6; i++) {
    // Primary check: prisma/schema.prisma exists
    if (fs.existsSync(path.join(dir, 'prisma', 'schema.prisma'))) {
      return dir;
    }
    // Secondary check: directory is named "backend"
    if (path.basename(dir) === 'backend') {
      return dir;
    }
    dir = path.resolve(dir, '..');
  }
  // Ultimate fallback — assume we're 2 levels deep in src/utils/
  return path.resolve(SCRIPT_DIR, '..', '..');
})();

// ── Derived paths — all computed from APP_ROOT ──

/** Backend root (same as APP_ROOT) */
export const BACKEND_ROOT: string = APP_ROOT;

/** Path to prisma/schema.prisma */
export const PRISMA_SCHEMA_PATH: string = path.join(APP_ROOT, 'prisma', 'schema.prisma');

/** Path to prisma/ directory */
export const PRISMA_DIR: string = path.join(APP_ROOT, 'prisma');

/** Path to backend/public/ (served frontend in production) */
export const PUBLIC_DIR: string = path.join(APP_ROOT, 'public');

/** Monorepo root (one level above backend/) */
export const PROJECT_ROOT: string = path.resolve(APP_ROOT, '..');

/** Path to frontend/dist/ (Vite build output) */
export const FRONTEND_DIST: string = path.join(PROJECT_ROOT, 'frontend', 'dist');
