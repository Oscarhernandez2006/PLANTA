/** Zona horaria de la planta (Colombia, UTC-5). */
export const PLANT_TIME_ZONE = 'America/Bogota';

/** Fecha de hoy (YYYY-MM-DD) según la zona horaria de la planta, no UTC. */
export function plantToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PLANT_TIME_ZONE,
  }).format(new Date());
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
