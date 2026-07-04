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
  const enginesDir = path.join(__dirname, 'node_modules/@prisma/engines');
  if (!fs.existsSync(enginesDir)) {
    console.log('[Backend Build] @prisma/engines directory not found, skipping engine pruning.');
    return;
  }

  console.log('[Backend Build] Pruning unused Prisma engine files...');
  try {
    const files = fs.readdirSync(enginesDir);
    let prunedCount = 0;
    
    for (const file of files) {
      // Keep migration-engine for auto-migrate on startup; remove only schema-engine & introspection-engine
      const isUnusedEngine = 
        file.startsWith('schema-engine') || 
        file.startsWith('introspection-engine') || 
        file.startsWith('query-engine') && !file.includes('debian') && !file.includes('windows') && !file.includes('library'); // keep windows & debian & library node engines
        
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
