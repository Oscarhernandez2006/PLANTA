import { X } from 'lucide-react';
import { plantToday } from '@/lib/utils';

/** Días hacia atrás que permite el filtro (igual al límite del backend). */
export const DIAS_FILTRO_FECHA = 30;

// Resta días a una fecha YYYY-MM-DD (sin zona horaria).
function restarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Calendario para filtrar órdenes por día (solo hacia atrás, últimos 30 días).
 * `value` null = sin filtro (muestra hoy); la X quita el filtro.
 */
export function FechaFiltro({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (fecha: string | null) => void;
}) {
  const hoy = plantToday();
  const desde = restarDias(hoy, DIAS_FILTRO_FECHA);

  function cambiar(v: string) {
    if (!v || v < desde || v > hoy) return;
    onChange(v);
  }

  return (
    <div className="flex h-9 items-center gap-1">
      <input
        type="date"
        aria-label="Filtrar órdenes por fecha"
        title={`Escogé un día de los últimos ${DIAS_FILTRO_FECHA} para ver sus órdenes`}
        value={value ?? hoy}
        min={desde}
        max={hoy}
        onKeyDown={(e) => e.preventDefault()}
        onClick={(e) => e.currentTarget.showPicker?.()}
        onChange={(e) => cambiar(e.target.value)}
        className="h-9 cursor-pointer bg-transparent text-lg font-semibold tabular-nums outline-none [&::-webkit-calendar-picker-indicator]:size-6 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Quitar filtro: ver todas las órdenes activas"
          aria-label="Quitar filtro de fecha"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-6" />
        </button>
      )}
    </div>
  );
}
