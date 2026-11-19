import { AlertTriangle, ClipboardCheck, Scale, Users, type LucideIcon } from 'lucide-react';
import type { ResumenListado, TipoListado } from './api';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
export const pesoInforme = (kg: number) => `${numero.format(kg)} kg`;

export function desplazarFecha(fecha: string, dias: number) {
  const date = new Date(`${fecha}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dias);
  return date.toISOString().slice(0, 10);
}

export function ResumenInforme({ resumen, tipo, cargando }: {
  resumen?: ResumenListado;
  tipo: TipoListado;
  cargando: boolean;
}) {
  const indicadores: { titulo: string; valor: string | number; icono: LucideIcon }[] = [
    { titulo: 'Órdenes procesadas', valor: resumen?.procesadas ?? '—', icono: ClipboardCheck },
    { titulo: tipo === 'canal-caliente' ? 'Peso registrado' : tipo === 'produccion' ? 'Órdenes del periodo' : 'Animales sacrificados',
      valor: !resumen ? '—' : tipo === 'canal-caliente' ? pesoInforme(resumen.peso) : tipo === 'produccion' ? resumen.ordenes : resumen.sacrificados, icono: Scale },
    { titulo: 'Clientes con movimiento', valor: resumen?.clientes ?? '—', icono: Users },
    { titulo: 'Pendientes de cierre', valor: resumen?.pendientes ?? '—', icono: AlertTriangle },
  ];
  return (
    <section aria-label="Indicadores del informe y periodo seleccionados" aria-busy={cargando}
      className="grid grid-cols-2 gap-3 lg:col-span-2 lg:row-start-1 lg:grid-cols-4">
      {indicadores.map(({ titulo, valor, icono: Icono }) => (
        <div key={titulo} className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-3 shadow-sm sm:gap-3 sm:px-4">
          <Icono className={`size-6 shrink-0 sm:size-8 ${Icono === AlertTriangle ? 'text-amber-600' : 'text-primary'}`} />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{titulo}</p>
            {cargando ? <div className="mt-1 h-6 w-14 animate-pulse rounded bg-muted" /> :
              <p className="break-words text-xl font-bold tabular-nums sm:text-2xl">{valor}</p>}
          </div>
        </div>
      ))}
    </section>
  );
}
