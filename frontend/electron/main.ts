import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';
import isDev from 'electron-is-dev';
import * as net from 'net';

// __filename and __dirname are automatically injected by Node.js in CommonJS format.
// No need to redeclare them.

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let selectedApiPort = '3000';

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false); // Port is in use
    });
    server.once('listening', () => {
      server.close();
      resolve(true); // Port is free
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findFreePort(startPort: number): Promise<number> {
  let port = startPort;
  while (!(await checkPort(port))) {
    console.log(`[Electron] Port ${port} is in use, checking next port...`);
    port++;
  }
  return port;
}

function startBackend(port: string) {
  console.log(`[Electron] Starting Express Backend Process on port ${port}...`);
  
  // In production, we'll run node on the bundled server file or spawn it.
  // In development, the backend might already be running or we can spawn it.
  // For development sandbox/debugging purposes:
  const backendPath = isDev 
    ? path.join(__dirname, '../../backend/dist/server.js')
    : path.join(process.resourcesPath, 'backend/dist/server.js');
    
  const invoicesDir = path.join(app.getPath('documents'), 'InvoiceDownloader', 'invoices');
  try {
    backendProcess = spawn('node', [backendPath], {
      env: { ...process.env, PORT: port, INVOICES_DIR: invoicesDir }
    });

    backendProcess.stdout?.on('data', (data) => {
      console.log(`[Backend API] ${data}`);
    });

    backendProcess.stderr?.on('data', (data) => {
      console.error(`[Backend API Error] ${data}`);
    });

    backendProcess.on('close', (code) => {
      console.log(`[Backend API] exited with code ${code}`);
    });
  } catch (error) {
    console.error('[Electron] Failed to start backend process:', error);
  }
}

function createWindow(port: string) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Invoice Downloader Pro',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // Customize style: sleek frame
    backgroundColor: '#0f172a',
  });

  const startUrl = isDev
    ? `http://localhost:5173?port=${port}`
    : `file://${path.join(__dirname, '../dist/index.html')}?port=${port}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Find a free port starting from the environment-specified PORT or 3000
  const preferredPort = parseInt(process.env.PORT || '3000', 10);
  const freePort = await findFreePort(preferredPort);
  selectedApiPort = String(freePort);

  // Start backend process
  startBackend(selectedApiPort);
  
  // Create window
  createWindow(selectedApiPort);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(selectedApiPort);
    }
  });
});

app.on('window-all-closed', () => {
  // Terminate backend API server before exit
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
