/** Zona horaria de la planta (Colombia, UTC-5). */
export const PLANT_TIME_ZONE = 'America/Bogota';

/**
 * Hora del día (0-23) en la que arranca la jornada de planta y se reinician
 * los consecutivos/turnos (4:00 a. m.). Todo lo registrado antes de esa hora
 * se considera parte del día de negocio anterior.
 */
export const PLANT_DAY_CUTOFF_HOUR = 4;

/**
 * Fecha de hoy (YYYY-MM-DD) según el día de negocio de la planta: la
 * jornada corre de 4:00 a. m. a 4:00 a. m. del día siguiente, en vez de
 * medianoche a medianoche. Así, un animal sacrificado a la 1:00 a. m. sigue
 * contando como parte del día anterior y los consecutivos (turnos del box,
 * canales, subproductos, etc.) se reinician a las 4:00 a. m.
 */
export function plantToday(): string {
  const shifted = new Date(
    Date.now() - PLANT_DAY_CUTOFF_HOUR * 60 * 60 * 1000,
  );
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PLANT_TIME_ZONE,
  }).format(shifted);
}

/**
 * Normaliza una fecha de negocio a la medianoche UTC de ese día calendario.
 * Sin argumento usa el día actual de la planta (America/Bogota).
 */
export function plantDateOnly(value?: string): Date {
  const str = value ?? plantToday();
  const d = new Date(`${str}T00:00:00.000Z`);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
