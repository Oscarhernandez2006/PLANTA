// ============================================================================
// Proceso principal de Electron.
// Envuelve el frontend (mismo React/Vite) y expone la MAC nativa del equipo
// por IPC, reemplazando al agente local. No requiere servicio aparte.
// ============================================================================

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { SerialPort } = require('serialport');

function extractWeightValue(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/kg|KG|kG|g|G|lb|LB|lbs|LBS/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const match = cleaned.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;

  const value = Number(match[0].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

async function listSerialPorts() {
  try {
    const ports = await SerialPort.list();
    return ports.map((port) => port.path);
  } catch {
    return [];
  }
}

async function listSerialPortsDetailed() {
  try {
    const ports = await SerialPort.list();
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer ?? null,
      friendlyName: port.friendlyName ?? null,
      serialNumber: port.serialNumber ?? null,
    }));
  } catch {
    return [];
  }
}

async function readScaleSerial({ port, timeoutMs = 4000, baudRate } = {}) {
  const candidatePorts = port ? [port] : await listSerialPorts();
  const baudRates = baudRate
    ? [baudRate]
    : [9600, 19200, 2400, 38400, 57600, 115200];

  for (const candidate of candidatePorts) {
    for (const baudRate of baudRates) {
      try {
        const serial = new SerialPort({
          path: candidate,
          baudRate,
          autoOpen: false,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
        });

        const readings = [];
        let settled = 0;

        const result = await new Promise((resolve) => {
          const close = () => {
            serial.removeAllListeners();
            serial.close((err) => resolve({ ok: false, value: null, error: err ? String(err) : 'closed' }));
          };

          const timeout = setTimeout(() => close(), timeoutMs);

          serial.on('error', (error) => {
            clearTimeout(timeout);
            serial.close(() => resolve({ ok: false, value: null, error: String(error) }));
          });

          serial.on('open', () => {
            serial.on('data', (chunk) => {
              const text = chunk.toString();
              const values = text
                .split(/\r?\n|\r/)
                .map((line) => extractWeightValue(line))
                .filter((v) => v !== null);

              if (values.length) {
                readings.push(...values);
                while (readings.length > 8) readings.shift();

                const min = Math.min(...readings);
                const max = Math.max(...readings);
                if (max - min <= 0.2) {
                  settled += 1;
                } else {
                  settled = 0;
                }

                if (settled >= 3) {
                  clearTimeout(timeout);
                  const last = Number(readings[readings.length - 1].toFixed(1));
                  serial.close(() => resolve({ ok: true, value: last, port: candidate, baudRate }));
                }
              }
            });
          });

          serial.open((err) => {
            if (err) {
              clearTimeout(timeout);
              serial.close(() => resolve({ ok: false, value: null, error: String(err) }));
            }
          });
        });

        if (result && result.ok) {
          return result;
        }
      } catch {
        // Intenta con el siguiente puerto / baudrate.
      }
    }
  }

  return { ok: false, value: null, error: 'scale_not_found' };
}

// En dev carga el servidor de Vite; en producción, los archivos empaquetados.
const DEV_URL = process.env.FRIGO_DEV_URL || 'http://localhost:5173';

const userDataPath = path.join(app.getPath('appData'), 'Frigorifico Planta');
const cachePath = path.join(userDataPath, 'Cache');

try {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.mkdirSync(cachePath, { recursive: true });
  app.setPath('userData', userDataPath);
  app.setPath('cache', cachePath);
} catch (error) {
  console.warn('No se pudo preparar la ruta de datos/caché de Electron:', error);
}

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

ipcMain.handle('scale:read-stable', async (_, options = {}) => {
  const result = await readScaleSerial(options);
  return {
    ok: !!result.ok,
    value: result.value ?? null,
    port: result.port ?? null,
    baudRate: result.baudRate ?? null,
    error: result.error ?? null,
  };
});

ipcMain.handle('scale:list-ports', () => listSerialPortsDetailed());

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
