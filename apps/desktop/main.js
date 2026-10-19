// ============================================================================
// Proceso principal de Electron.
// Envuelve el frontend (mismo React/Vite) y expone la MAC nativa del equipo
// por IPC, reemplazando al agente local. No requiere servicio aparte.
// ============================================================================

const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
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

// Trama de la báscula: "ST,GS,+   1.90kg" (ST = estable) o "US,..." (inestable).
// Solo se acepta el primer peso estable (ST); los US se ignoran.
function parseScaleLine(line) {
  if (!line || typeof line !== 'string') return null;
  const s = line.trim();
  if (!s) return null;

  const stable = /^ST\b/i.test(s);
  const unstable = /^US\b/i.test(s);
  const value = extractWeightValue(s);
  if (value === null) return null;

  return { stable: stable && !unstable, value };
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
            let buffer = '';
            serial.on('data', (chunk) => {
              buffer += chunk.toString();
              const lines = buffer.split(/\r?\n|\r/);
              // Conserva la última línea si aún está incompleta.
              buffer = lines.pop() ?? '';

              for (const line of lines) {
                const parsed = parseScaleLine(line);
                if (!parsed || !parsed.stable) continue;

                // Primer peso estable (ST): se toma y se cierra.
                clearTimeout(timeout);
                const value = Number(parsed.value.toFixed(2));
                serial.close(() =>
                  resolve({ ok: true, value, port: candidate, baudRate }),
                );
                return;
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

/**
 * Prueba un puerto en una velocidad durante `ms`: devuelve si abrió, si
 * llegaron datos y la primera línea con peso (trama) que se recibió.
 */
function sondearPuerto(path, baudRate, ms) {
  return new Promise((resolve) => {
    let serial;
    try {
      serial = new SerialPort({ path, baudRate, autoOpen: false, dataBits: 8, parity: 'none', stopBits: 1 });
    } catch (e) {
      resolve({ abre: false, error: String(e) });
      return;
    }
    let buffer = '';
    let datos = false;
    let ultimaTrama = null;
    let terminado = false;
    const fin = (r) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(timer);
      serial.removeAllListeners('data');
      serial.close(() => resolve(r));
    };
    const timer = setTimeout(() => fin({ abre: true, datos, trama: ultimaTrama, valor: null }), ms);
    serial.on('error', (e) => fin({ abre: false, error: String(e) }));
    serial.on('data', (chunk) => {
      datos = true;
      buffer += chunk.toString();
      const lineas = buffer.split(/\r?\n|\r/);
      buffer = lineas.pop() ?? '';
      for (const linea of lineas) {
        const limpia = linea.trim();
        if (!limpia) continue;
        ultimaTrama = limpia.slice(0, 80);
        const parsed = parseScaleLine(limpia);
        if (parsed) {
          fin({ abre: true, datos: true, trama: ultimaTrama, valor: parsed.value, estable: parsed.stable });
          return;
        }
      }
    });
    serial.open((err) => {
      if (err) {
        terminado = true;
        clearTimeout(timer);
        resolve({ abre: false, error: String(err) });
      }
    });
  });
}

/**
 * Detecta en qué puerto COM está la báscula: revisa todos los puertos a la
 * vez (cada uno prueba las velocidades una tras otra) y devuelve, por puerto,
 * si abrió, si recibió datos, la trama y el peso leído.
 */
async function detectScale({ msPorVelocidad = 1500 } = {}) {
  const puertos = await listSerialPortsDetailed();
  const velocidades = [9600, 19200, 2400, 38400, 57600, 115200];
  const resultados = await Promise.all(
    puertos.map(async (p) => {
      let mejor = { abre: false, datos: false, trama: null, valor: null, baudRate: null, error: null };
      for (const baudRate of velocidades) {
        const r = await sondearPuerto(p.path, baudRate, msPorVelocidad);
        if (!r.abre) {
          // No se puede abrir (ocupado o sin dispositivo): no tiene caso probar otras velocidades.
          mejor = { ...mejor, error: r.error ?? 'no_abre' };
          break;
        }
        mejor = { ...mejor, abre: true, error: null };
        if (r.datos && !mejor.datos) mejor = { ...mejor, datos: true, trama: r.trama, baudRate };
        if (r.valor != null) {
          mejor = { ...mejor, datos: true, trama: r.trama, valor: r.valor, estable: !!r.estable, baudRate };
          break;
        }
      }
      return { ...p, ...mejor };
    }),
  );
  const bascula = resultados.find((r) => r.valor != null) ?? null;
  return {
    bascula: bascula ? { port: bascula.path, baudRate: bascula.baudRate, value: bascula.valor, trama: bascula.trama } : null,
    puertos: resultados,
  };
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

ipcMain.handle('scale:detect', (_, options = {}) => detectScale(options));

/** Lista las impresoras instaladas en Windows (nombre exacto para imprimir RAW). */
ipcMain.handle('printer:list', async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return [];
  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((p) => ({ name: p.name, isDefault: !!p.isDefault }));
  } catch {
    return [];
  }
});

/**
 * Envía ZPL (u otro texto crudo) directo al spooler de Windows en modo RAW,
 * sin pasar por el driver (necesario para que la Zebra lo interprete como
 * ZPL y no como texto/gráfico). Escribe el contenido a un archivo temporal
 * y lo manda vía `print-raw.ps1` (WinSpool RAW), evitando compartir la
 * impresora o depender del puerto exacto (USB001, etc.).
 */
ipcMain.handle('printer:print-raw', async (_, { printerName, content } = {}) => {
  if (!printerName || !content) {
    return { ok: false, error: 'faltan_datos' };
  }
  const tempFile = path.join(
    os.tmpdir(),
    `presinto-${Date.now()}-${Math.random().toString(36).slice(2)}.zpl`,
  );
  try {
    fs.writeFileSync(tempFile, content, 'utf8');
  } catch (e) {
    return { ok: false, error: `no_se_pudo_escribir_temp: ${String(e)}` };
  }

  return new Promise((resolve) => {
    // Windows: WinSpool RAW vía print-raw.ps1. Linux/macOS: CUPS con `lp -o raw`
    // (el ZPL llega tal cual a la Zebra, sin pasar por el filtro del driver).
    const child =
      process.platform === 'win32'
        ? spawn(
            'powershell.exe',
            [
              '-NoProfile',
              '-ExecutionPolicy',
              'Bypass',
              '-File',
              path.join(__dirname, 'print-raw.ps1'),
              '-PrinterName',
              printerName,
              '-FilePath',
              tempFile,
            ],
            { windowsHide: true },
          )
        : spawn('lp', ['-d', printerName, '-o', 'raw', tempFile]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => {
      fs.unlink(tempFile, () => {});
      if (code === 0) {
        resolve({ ok: true, output: stdout.trim() });
      } else {
        resolve({ ok: false, error: stderr.trim() || `codigo_salida_${code}` });
      }
    });
    child.on('error', (err) => {
      fs.unlink(tempFile, () => {});
      resolve({ ok: false, error: String(err) });
    });
  });
});

let mainWindow = null;

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
    win.webContents.openDevTools({ mode: 'detach' });
  }
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  return win;
}

// ============================================================================
// Actualizaciones automáticas (GitHub Releases, ver "publish" en package.json).
// Al abrir: busca versión nueva; si la hay la descarga e instala antes de
// mostrar la app. Con la app abierta: revisa cada hora, descarga en segundo
// plano y avisa a la interfaz; se instala al pulsar "Reiniciar" o al cerrar.
// ============================================================================

const BUSQUEDA_INICIAL_MS = 15_000; // sin respuesta en este tiempo, se abre la app igual
const DESCARGA_INICIAL_MAX_MS = 5 * 60_000; // descarga más lenta: sigue en segundo plano
const REVISION_PERIODICA_MS = 60 * 60_000;

let updateState = { status: 'idle', version: null, percent: 0, error: null };

function logUpdater(...partes) {
  try {
    fs.appendFileSync(
      path.join(app.getPath('userData'), 'updater.log'),
      `[${new Date().toISOString()}] ${partes.join(' ')}\n`,
    );
  } catch {
    /* sin log no pasa nada */
  }
}

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('update:status', updateState);
  }
}

ipcMain.handle('update:get-state', () => ({ ...updateState, appVersion: app.getVersion() }));
ipcMain.handle('update:install', () => {
  if (updateState.status !== 'downloaded') return { ok: false };
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return { ok: true };
});

/** Ventana pequeña que muestra el progreso de la actualización al abrir. */
function crearSplash() {
  const splash = new BrowserWindow({
    width: 440,
    height: 230,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    backgroundColor: '#0b0f14',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:Segoe UI,Arial,sans-serif;background:#0b0f14;color:#e5e7eb;user-select:none}
    h1{font-size:18px;margin:0 0 6px;font-weight:600}
    #txt{font-size:13px;color:#9ca3af;margin-bottom:16px;text-align:center;padding:0 20px}
    .bar{width:320px;height:8px;border-radius:4px;background:#1f2937;overflow:hidden}
    #fill{height:100%;width:0;background:#10b981;transition:width .3s}
    #ver{position:fixed;bottom:10px;font-size:11px;color:#6b7280}
  </style></head><body>
    <h1>Frigorífico Planta</h1><div id="txt">Buscando actualizaciones…</div>
    <div class="bar"><div id="fill"></div></div><div id="ver">Versión ${app.getVersion()}</div>
  </body></html>`;
  void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  splash.once('ready-to-show', () => splash.show());
  return splash;
}

function actualizarSplash(splash, texto, percent) {
  if (!splash || splash.isDestroyed()) return;
  const js = `document.getElementById('txt').textContent=${JSON.stringify(texto)};` +
    (percent != null ? `document.getElementById('fill').style.width='${Math.round(percent)}%';` : '');
  splash.webContents.executeJavaScript(js).catch(() => {});
}

function configurarUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: (m) => logUpdater('INFO', m), warn: (m) => logUpdater('WARN', m), error: (m) => logUpdater('ERROR', m), debug: () => {} };

  autoUpdater.on('checking-for-update', () => setUpdateState({ status: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => setUpdateState({ status: 'up-to-date' }));
  autoUpdater.on('update-available', (info) =>
    setUpdateState({ status: 'downloading', version: info.version, percent: 0 }),
  );
  autoUpdater.on('download-progress', (p) => setUpdateState({ status: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', (info) =>
    setUpdateState({ status: 'downloaded', version: info.version, percent: 100 }),
  );
  autoUpdater.on('error', (err) => {
    logUpdater('ERROR', String(err?.stack ?? err));
    setUpdateState({ status: 'error', error: String(err?.message ?? err) });
  });
}

/**
 * Búsqueda al abrir: si hay versión nueva la descarga mostrando el progreso
 * y la instala (la app se reinicia sola). Devuelve true si se está
 * instalando; false para seguir abriendo la app normalmente.
 */
function actualizarAlAbrir(splash) {
  return new Promise((resolve) => {
    let terminado = false;
    const fin = (instalando) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(tBusqueda);
      clearTimeout(tDescarga);
      autoUpdater.off('update-available', alDisponible);
      autoUpdater.off('update-not-available', alNoDisponible);
      autoUpdater.off('download-progress', alProgreso);
      autoUpdater.off('update-downloaded', alDescargada);
      autoUpdater.off('error', alError);
      resolve(instalando);
    };
    let tDescarga = null;
    const tBusqueda = setTimeout(() => fin(false), BUSQUEDA_INICIAL_MS);
    const alDisponible = (info) => {
      clearTimeout(tBusqueda);
      actualizarSplash(splash, `Descargando la versión ${info.version}…`, 0);
      tDescarga = setTimeout(() => fin(false), DESCARGA_INICIAL_MAX_MS);
    };
    const alNoDisponible = () => fin(false);
    const alProgreso = (p) =>
      actualizarSplash(splash, `Descargando actualización… ${Math.round(p.percent)}%`, p.percent);
    const alDescargada = (info) => {
      actualizarSplash(splash, `Instalando la versión ${info.version}…`, 100);
      setTimeout(() => autoUpdater.quitAndInstall(true, true), 800);
      fin(true);
    };
    const alError = () => fin(false);
    autoUpdater.on('update-available', alDisponible);
    autoUpdater.on('update-not-available', alNoDisponible);
    autoUpdater.on('download-progress', alProgreso);
    autoUpdater.on('update-downloaded', alDescargada);
    autoUpdater.on('error', alError);
    autoUpdater.checkForUpdates().catch(() => fin(false));
  });
}

async function arrancar() {
  if (!app.isPackaged) {
    createWindow();
    return;
  }
  configurarUpdater();
  const splash = crearSplash();
  const instalando = await actualizarAlAbrir(splash);
  if (instalando) return;
  createWindow();
  if (!splash.isDestroyed()) splash.close();
  setInterval(() => {
    // Si ya hay una descargada esperando, no se vuelve a buscar.
    if (updateState.status !== 'downloaded' && updateState.status !== 'downloading') {
      autoUpdater.checkForUpdates().catch(() => {});
    }
  }, REVISION_PERIODICA_MS);
}

// Una sola instancia: si se abre otra vez, se enfoca la ventana existente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    void arrancar();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
