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

/** Puente expuesto por la app de escritorio (Electron) vía preload. */
interface FrigoDesktopBridge {
  getDeviceInfo: () => Promise<LocalDeviceInfo>;
  openKeyboard?: () => Promise<{ ok: boolean }>;
  readScale?: (options?: { port?: string; timeoutMs?: number }) => Promise<ScaleReadResult>;
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

export async function readScale(options?: { port?: string; timeoutMs?: number }): Promise<ScaleReadResult> {
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
