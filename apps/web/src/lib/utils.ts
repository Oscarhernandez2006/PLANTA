import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Fecha de hoy (YYYY-MM-DD) según el día de negocio de la planta
 * (America/Bogota): la jornada corre de 5:00 a. m. a 5:00 a. m. del día
 * siguiente, no de medianoche a medianoche (los turnos/consecutivos se
 * reinician a las 5:00 a. m.; igual que PLANT_DAY_CUTOFF_HOUR en la API).
 */
export function plantToday(): string {
  const shifted = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
  }).format(shifted);
}

/**
 * Normaliza lo digitado en un campo decimal: la coma se convierte en punto,
 * solo quedan dígitos y un único separador decimal ("12,5" → "12.5").
 */
export function soloDecimal(v: string): string {
  const s = v.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const i = s.indexOf('.');
  return i === -1 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
}

/** Formatea kilogramos con separador de miles y 2-3 decimales. */
export function formatKg(value: number | string, decimals = 2): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 3,
  }).format(n);
}

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(d);
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/**
 * Fecha de negocio (YYYY-MM-DD) como DD/MM/AAAA. No pasa por `Date` para no
 * correrse un día por la zona horaria.
 */
export function formatFechaDia(fecha: string): string {
  return fecha.slice(0, 10).split('-').reverse().join('/');
}
