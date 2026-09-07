// ============================================================================
// Proceso principal de Electron.
// Envuelve el frontend (mismo React/Vite) y expone la MAC nativa del equipo
// por IPC, reemplazando al agente local. No requiere servicio aparte.
// ============================================================================

const { app, BrowserWindow, ipcMain } = require('electron');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

// En dev carga el servidor de Vite; en producción, los archivos empaquetados.
const DEV_URL = process.env.FRIGO_DEV_URL || 'http://localhost:5173';

/** MAC físicas (no internas, no nulas), sin duplicados. */
function collectMacs() {
  const ifaces = os.networkInterfaces();
  const macs = new Set();
  for (const name of Object.keys(ifaces).sort()) {
    for (const info of ifaces[name] ?? []) {
      if (info.internal) continue;
      if (!info.mac || info.mac === '00:00:00:00:00:00') continue;
      macs.add(info.mac.toUpperCase());
    }
  }
  return [...macs];
}

function deviceInfo() {
  const macs = collectMacs();
  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    macs,
    primaryMac: macs[0] ?? null,
  };
}

ipcMain.handle('device:get-info', () => deviceInfo());

// Abre el TECLADO TÁCTIL de Windows (TabTip) vía script PowerShell (COM Toggle).
ipcMain.handle('keyboard:open', () => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not_windows' };
  return new Promise((resolve) => {
    try {
      const script = path.join(__dirname, 'open-touch-keyboard.ps1');
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-WindowStyle',
          'Hidden',
          '-File',
          script,
        ],
        { detached: true, stdio: 'ignore', windowsHide: true },
      );
      child.on('error', (err) => resolve({ ok: false, error: String(err) }));
      child.unref();
      resolve({ ok: true });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    void win.loadFile(path.join(__dirname, 'web', 'index.html'));
  } else {
    void win.loadURL(DEV_URL);
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
