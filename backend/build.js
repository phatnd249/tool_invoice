import { build } from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runBuild() {
  console.log('[Backend Build] Starting esbuild bundling...');
  
  try {
    await build({
      entryPoints: [path.join(__dirname, 'src/server.ts')],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      outfile: path.join(__dirname, 'dist/server.cjs'),
      external: ['sharp', '@prisma/client'],
      sourcemap: true,
      minify: true,
      // Replace import.meta.url with a valid file URL derived from __filename
      // (which exists in CJS bundles). This fixes dependencies like 'open' that
      // call fileURLToPath(import.meta.url) in ESM-only code.
      define: {
        'import.meta.url': JSON.stringify('file://' + path.join(__dirname, 'dist/server.cjs')),
      },
    });
    console.log('[Backend Build] esbuild bundled successfully to dist/server.cjs');
    
    // Patch dist/server.cjs to avoid pkg crashing on 'node:sqlite'
    const serverCjsPath = path.join(__dirname, 'dist/server.cjs');
    if (fs.existsSync(serverCjsPath)) {
      let content = fs.readFileSync(serverCjsPath, 'utf8');
      content = content.replace(/require\(['"]node:sqlite['"]\)/g, 'require("events")');
      fs.writeFileSync(serverCjsPath, content);
    }

    // Patch node_modules/undici to avoid pkg crashing on 'node:sqlite'
    const undiciFiles = [
      path.join(__dirname, 'node_modules/undici/lib/cache/sqlite-cache-store.js'),
      path.join(__dirname, 'node_modules/undici/lib/util/runtime-features.js')
    ];
    for (const f of undiciFiles) {
      if (fs.existsSync(f)) {
        let content = fs.readFileSync(f, 'utf8');
        content = content.replace(/require\(['"]node:sqlite['"]\)/g, 'require("events")');
        fs.writeFileSync(f, content);
      }
    }
    console.log('[Backend Build] Patched files for pkg compatibility (node:sqlite)');

    // Prune unnecessary Prisma engine files to save space
    prunePrismaEngines();
  } catch (error) {
    console.error('[Backend Build] Build failed:', error);
    process.exit(1);
  }
}

function prunePrismaEngines() {
  // Prisma engines are now in root node_modules due to monorepo workspaces.
  // Resolve path from root, not from backend/.
  const rootDir = path.resolve(__dirname, '..');
  const enginesDir = path.join(rootDir, 'node_modules/@prisma/engines');
  if (!fs.existsSync(enginesDir)) {
    console.log('[Backend Build] @prisma/engines directory not found at root, skipping engine pruning.');
    return;
  }

  console.log('[Backend Build] Pruning unused Prisma engine files...');
  try {
    const files = fs.readdirSync(enginesDir);
    let prunedCount = 0;

    for (const file of files) {
      // Keep all query engines for cross-platform compatibility.
      // Remove only schema-engine & introspection-engine (not needed at runtime).
      const isUnusedEngine =
        file.startsWith('schema-engine') ||
        file.startsWith('introspection-engine');

      if (isUnusedEngine) {
        const filePath = path.join(enginesDir, file);
        fs.unlinkSync(filePath);
        console.log(`[Backend Build] Removed engine file: ${file}`);
        prunedCount++;
      }
    }
    console.log(`[Backend Build] Finished pruning. Removed ${prunedCount} unused Prisma files.`);
  } catch (err) {
    console.warn('[Backend Build] Error during Prisma engine pruning:', err);
  }
}

runBuild();
