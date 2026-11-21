export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'desconocido';

const DIA_MS = 86_400_000;
const prioridad: Record<Semaforo, number> = { verde: 0, desconocido: 1, amarillo: 2, rojo: 3 };

export function semaforoVencimiento(vencimiento: Date | null, hoy: Date): Semaforo {
  if (!vencimiento) return 'desconocido';
  const dias = Math.round((vencimiento.getTime() - hoy.getTime()) / DIA_MS);
  return dias <= 4 ? 'rojo' : dias === 5 ? 'amarillo' : 'verde';
}

export function semaforoCanal(ingreso: Date, ahora: number): Semaforo {
  const dias = (ahora - ingreso.getTime()) / DIA_MS;
  return dias >= 5 ? 'rojo' : dias >= 4 ? 'amarillo' : 'verde';
}

export function peorSemaforo(actual: Semaforo | null, siguiente: Semaforo): Semaforo {
  return actual === null || prioridad[siguiente] > prioridad[actual] ? siguiente : actual;
}
