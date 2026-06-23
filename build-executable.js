import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = __dirname;
const frontendDir = path.join(rootDir, 'frontend');
const backendDir = path.join(rootDir, 'backend');
const outputDir = path.join(rootDir, 'dist-executable');

function runCommand(command, cwd) {
  console.log(`\n[Exec] Running: ${command} in ${cwd}...`);
  execSync(command, { cwd, stdio: 'inherit' });
}

async function buildAll() {
  console.log('====== STARTING STANDALONE EXECUTABLE BUILD PROCESS ======');

  // Step 1: Build React Frontend
  console.log('\n--- Step 1: Building Frontend React App ---');
  runCommand('npm run build', frontendDir);

  // Step 2: Build Backend (Bundling code with esbuild and pruning engines)
  console.log('\n--- Step 2: Building Backend API Server ---');
  runCommand('npm run build', backendDir);

  // Step 3: Package Backend and embedded frontend static files using Vercel Pkg
  console.log('\n--- Step 3: Packaging Standalone Binary with pkg ---');
  runCommand('npm run pkg', backendDir);

  // Step 4: Copy Native Dependencies to output directory next to executable
  console.log('\n--- Step 4: Copying Native Node Modules ---');
  
  const destNodeModules = path.join(outputDir, 'node_modules');
  if (!fs.existsSync(destNodeModules)) {
    fs.mkdirSync(destNodeModules, { recursive: true });
  }

  const nativeModules = [
    '@prisma',
    '.prisma',
    'sharp'
  ];

  for (const mod of nativeModules) {
    const srcPath = path.join(backendDir, 'node_modules', mod);
    const destPath = path.join(destNodeModules, mod);

    if (fs.existsSync(srcPath)) {
      console.log(` - Copying native module: ${mod}`);
      if (fs.existsSync(destPath)) {
        fs.rmSync(destPath, { recursive: true, force: true });
      }
      fs.cpSync(srcPath, destPath, { recursive: true });
    } else {
      console.warn(` - Warning: Native module ${mod} not found at ${srcPath}`);
    }
  }

  // Copy prisma schema and dev.db next to executable as fallback
  console.log('\n--- Step 5: Copying Database Template ---');
  const destPrisma = path.join(outputDir, 'prisma');
  if (!fs.existsSync(destPrisma)) {
    fs.mkdirSync(destPrisma, { recursive: true });
  }
  
  const srcSchema = path.join(backendDir, 'prisma', 'schema.prisma');
  const destSchema = path.join(destPrisma, 'schema.prisma');
  if (fs.existsSync(srcSchema)) {
    fs.copyFileSync(srcSchema, destSchema);
    console.log(' - Copied schema.prisma');
  }

  const srcDb = path.join(backendDir, 'prisma', 'dev.db');
  const destDb = path.join(destPrisma, 'dev.db');
  if (fs.existsSync(srcDb)) {
    fs.copyFileSync(srcDb, destDb);
    console.log(' - Copied template dev.db');
  }

  console.log('\n====== BUILD COMPLETED SUCCESSFULLY ======');
  console.log(`Stand-alone executables and resources are located in: ${outputDir}`);
  console.log('To run, execute the binary for your platform and open http://localhost:<port> in browser.');
}

buildAll().catch((err) => {
  console.error('Build process failed:', err);
  process.exit(1);
});
