import { api } from './api';

const AGENT_URL =
  (import.meta.env.VITE_AGENT_URL as string | undefined) ??
  'http://127.0.0.1:47615';

export interface LocalDeviceInfo {
  hostname: string;
  platform: string;
  macs: string[];
  primaryMac: string | null;
}

export interface ScaleReadResult {
  ok: boolean;
  value: number | null;
  port: string | null;
  baudRate: number | null;
  error: string | null;
}

export interface ScalePortInfo {
  path: string;
  manufacturer: string | null;
  friendlyName: string | null;
  serialNumber: string | null;
}

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

export interface PrintRawResult {
  ok: boolean;
  output?: string;
  error?: string;
}

/** Puente expuesto por la app de escritorio (Electron) vía preload. */
interface FrigoDesktopBridge {
  getDeviceInfo: () => Promise<LocalDeviceInfo>;
  openKeyboard?: () => Promise<{ ok: boolean }>;
  readScale?: (options?: {
    port?: string;
    timeoutMs?: number;
    baudRate?: number;
  }) => Promise<ScaleReadResult>;
  listScalePorts?: () => Promise<ScalePortInfo[]>;
  listPrinters?: () => Promise<PrinterInfo[]>;
  printRaw?: (printerName: string, content: string) => Promise<PrintRawResult>;
}
declare global {
  interface Window {
    frigoDesktop?: FrigoDesktopBridge;
  }
}

/** Indica si corremos dentro de la app de escritorio. */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.frigoDesktop;
}

/** Abre el teclado en pantalla de Windows (solo en la app de escritorio). */
export async function openOnScreenKeyboard(): Promise<boolean> {
  if (window.frigoDesktop?.openKeyboard) {
    try {
      const r = await window.frigoDesktop.openKeyboard();
      return !!r?.ok;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Obtiene la info del equipo (MAC incluida).
 * - En la app de escritorio: MAC nativa vía puente, sin agente ni HTTP.
 * - En navegador: consulta el agente local por HTTP (fallback).
 */
export async function getLocalDeviceInfo(
  timeoutMs = 2500,
): Promise<LocalDeviceInfo> {
  if (window.frigoDesktop) {
    return window.frigoDesktop.getDeviceInfo();
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${AGENT_URL}/device-info`, { signal: ctrl.signal });
    if (!res.ok) throw new Error('agent_error');
    return (await res.json()) as LocalDeviceInfo;
  } finally {
    clearTimeout(timer);
  }
}

export async function readScale(options?: {
  port?: string;
  timeoutMs?: number;
  baudRate?: number;
}): Promise<ScaleReadResult> {
  if (window.frigoDesktop?.readScale) {
    return window.frigoDesktop.readScale(options);
  }

  return {
    ok: false,
    value: null,
    port: null,
    baudRate: null,
    error: 'not_supported',
  };
}

/** Lista los puertos serie disponibles (solo en la app de escritorio). */
export async function listScalePorts(): Promise<ScalePortInfo[]> {
  if (window.frigoDesktop?.listScalePorts) {
    try {
      return await window.frigoDesktop.listScalePorts();
    } catch {
      return [];
    }
  }
  return [];
}

const SCALE_PORT_KEY = 'frigo.scale.port';
const SCALE_BAUD_KEY = 'frigo.scale.baud';

/** Puerto de báscula guardado por el usuario (persistente). */
export function getSavedScalePort(): string | null {
  try {
    return window.localStorage.getItem(SCALE_PORT_KEY);
  } catch {
    return null;
  }
}

export function setSavedScalePort(port: string | null): void {
  try {
    if (port) window.localStorage.setItem(SCALE_PORT_KEY, port);
    else window.localStorage.removeItem(SCALE_PORT_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

export function getSavedScaleBaud(): number | null {
  try {
    const raw = window.localStorage.getItem(SCALE_BAUD_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function setSavedScaleBaud(baud: number | null): void {
  try {
    if (baud) window.localStorage.setItem(SCALE_BAUD_KEY, String(baud));
    else window.localStorage.removeItem(SCALE_BAUD_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Lista las impresoras instaladas en Windows (solo en la app de escritorio). */
export async function listPrinters(): Promise<PrinterInfo[]> {
  if (window.frigoDesktop?.listPrinters) {
    try {
      return await window.frigoDesktop.listPrinters();
    } catch {
      return [];
    }
  }
  return [];
}

/** Envía contenido crudo (ej. ZPL) directo a una impresora de Windows, sin pasar por el driver. */
export async function printRaw(
  printerName: string,
  content: string,
): Promise<PrintRawResult> {
  if (window.frigoDesktop?.printRaw) {
    return window.frigoDesktop.printRaw(printerName, content);
  }
  return { ok: false, error: 'not_supported' };
}

const PRINTER_NAME_KEY = 'frigo.printer.name';

/** Impresora de presintos guardada por el usuario (persistente). */
export function getSavedPrinterName(): string | null {
  try {
    return window.localStorage.getItem(PRINTER_NAME_KEY);
  } catch {
    return null;
  }
}

export function setSavedPrinterName(name: string | null): void {
  try {
    if (name) window.localStorage.setItem(PRINTER_NAME_KEY, name);
    else window.localStorage.removeItem(PRINTER_NAME_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

export interface DeviceValidation {
  authorized: boolean;
  bootstrap: boolean;
  mac: string | null;
  reason: 'inactive' | 'unregistered' | null;
  deviceName?: string;
}

/** Valida la(s) MAC del equipo contra el registro (endpoint público). */
export async function validateDevice(
  macs: string[],
  hostname?: string,
): Promise<DeviceValidation> {
  const res = await api.post<DeviceValidation>('/devices/validate', {
    macs,
    hostname,
  });
  return res.data;
}
