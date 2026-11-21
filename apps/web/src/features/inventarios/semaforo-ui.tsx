import { CalendarClock } from 'lucide-react';
import { cn, plantToday } from '@/lib/utils';
import type { Semaforo } from './api';

export const DIAS_VENCE = 5;
export const fecha = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

export function diasVence(iso: string | null) {
  if (!iso) return null;
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${plantToday()}T00:00:00Z`)) / 86_400_000);
}

export function VenceChip({ iso, resaltado = false }: { iso: string | null; resaltado?: boolean }) {
  const d = diasVence(iso);
  if (d == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
        d <= 4 ? 'bg-red-100 text-red-700' : d === DIAS_VENCE ? 'bg-amber-100 text-amber-800' : resaltado ? 'bg-emerald-100 text-emerald-800' : 'text-foreground',
      )}
      title={d < 0 ? `Vencido hace ${-d} día(s)` : d === 0 ? 'Vence hoy' : `Faltan ${d} día(s)`}
    >
      {d <= DIAS_VENCE && <CalendarClock className="size-3" />}
      {fecha(iso)}
    </span>
  );
}

const prioridadSemaforo: Record<Semaforo, number> = { verde: 0, desconocido: 1, amarillo: 2, rojo: 3 };

export function semaforoGeneral(estados: Semaforo[]): Semaforo {
  return estados.reduce<Semaforo | null>(
    (peor, estado) => peor === null || prioridadSemaforo[estado] > prioridadSemaforo[peor] ? estado : peor,
    null,
  ) ?? 'desconocido';
}

export function SemaforoPill({ estado, canal = false }: { estado: Semaforo | null; canal?: boolean }) {
  const valor = estado ?? 'desconocido';
  return (
    <span
      role="img"
      aria-label={`Semáforo: ${valor === 'desconocido' ? 'sin fecha' : valor}`}
      title={canal ? `Semáforo ${valor}: antigüedad desde el ingreso` : `Semáforo: ${valor === 'desconocido' ? 'sin fecha' : valor}`}
      className={cn('inline-block size-2.5 shrink-0 rounded-full', valor === 'rojo' ? 'bg-red-500' :
        valor === 'amarillo' ? 'bg-amber-400' : valor === 'verde' ? 'bg-emerald-500' : 'bg-slate-400')}
    />
  );
}
