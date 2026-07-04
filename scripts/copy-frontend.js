#!/usr/bin/env node
/**
 * Copy built frontend assets into backend/public/ for production serving.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const frontendDist = path.join(rootDir, 'frontend', 'dist');
const backendPublic = path.join(rootDir, 'backend', 'public');

console.log('[Copy Frontend] Copying frontend build to backend/public/...');
console.log(`  Source: ${frontendDist}`);
console.log(`  Target: ${backendPublic}`);

if (!fs.existsSync(frontendDist)) {
  console.error(`[Copy Frontend] ERROR: Frontend build not found at ${frontendDist}.`);
  console.error('[Copy Frontend] Run "npm run build:frontend" first.');
  process.exit(1);
}

// Remove old public directory
if (fs.existsSync(backendPublic)) {
  fs.rmSync(backendPublic, { recursive: true });
}

// Copy recursively
function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyRecursive(frontendDist, backendPublic);
console.log('[Copy Frontend] Done.');
