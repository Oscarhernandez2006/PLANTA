import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Fecha de hoy (YYYY-MM-DD) según el día de negocio de la planta
 * (America/Bogota): la jornada corre de 4:00 a. m. a 4:00 a. m. del día
 * siguiente, no de medianoche a medianoche (los turnos/consecutivos se
 * reinician a las 4:00 a. m.).
 */
export function plantToday(): string {
  const shifted = new Date(Date.now() - 4 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
  }).format(shifted);
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
