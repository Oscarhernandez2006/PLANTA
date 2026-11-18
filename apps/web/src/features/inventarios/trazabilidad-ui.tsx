import { useState, type ComponentType, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, CircleCheck, Copy, FileDown, LoaderCircle, Printer, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { kg } from './BodegasTab';

/** Estado de una orden interna (OD, OP, OT, OC): "facturado" en BD significa cerrada, no facturada. */
export const estadoOrden = (s: string) =>
  s === 'activo' ? 'ACTIVA' : s === 'facturado' ? 'CERRADA' : s === 'inactivo' ? 'ANULADA' : s.toUpperCase();

export const fechaHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const kgs = (n: number | null | undefined) => (n == null ? '—' : `${kg(n)} kg`);

/** Color por tipo de paso: origen y recepción, proceso, salida. */
export type Tono = 'origen' | 'proceso' | 'salida' | 'neutro';

const TONO_ICONO: Record<Tono, string> = {
  origen: 'border-sky-300 bg-sky-50 text-sky-700',
  proceso: 'border-amber-300 bg-amber-50 text-amber-700',
  salida: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  neutro: 'border-border bg-card text-foreground',
};


/** Paso de la línea de tiempo: plegable; los vacíos solo muestran su nota. */
export function Paso({
  id,
  tono = 'neutro',
  icon: Icon,
  titulo,
  at,
  operario,
  vacio,
  final,
  children,
}: {
  id?: string;
  tono?: Tono;
  icon: ComponentType<{ className?: string }>;
  titulo: string;
  at?: string | null;
  operario?: string | null;
  vacio?: string | false;
  final?: boolean;
  children?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(true);
  const conContenido = !vacio && children != null && children !== false;
  return (
    <li id={id} className="relative scroll-mt-4">
      <span
        className={cn(
          'absolute -left-[2.35rem] top-0 flex size-8 items-center justify-center rounded-full border-2',
          final ? 'border-emerald-600 bg-emerald-600 text-white' : vacio ? 'border-border bg-muted text-muted-foreground' : TONO_ICONO[tono],
        )}
      >
        <Icon className="size-4" />
      </span>
      <button
        type="button"
        disabled={!conContenido}
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full flex-wrap items-baseline justify-between gap-x-4 rounded-md text-left enabled:hover:text-primary disabled:cursor-default"
      >
        <h3 className={cn('flex items-center gap-1 text-base font-semibold uppercase', vacio && 'text-muted-foreground')}>
          {conContenido && (abierto ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />)}
          {titulo}
        </h3>
        {(at || operario) && (
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {at && fechaHora(at)}
            {at && operario && ' · '}
            {operario}
          </span>
        )}
      </button>
      {vacio ? (
        <p className="mt-1 text-sm text-muted-foreground">{vacio}</p>
      ) : (
        conContenido &&
        abierto && <div className="mt-2 space-y-3 rounded-lg border border-border bg-card p-3 shadow-sm">{children}</div>
      )}
    </li>
  );
}

export function Linea({ children }: { children: ReactNode }) {
  return <ol className="relative ml-4 space-y-5 border-l-2 border-border pl-6">{children}</ol>;
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">{children}</div>;
}

export function Dato({ label, valor, ancho, resaltar }: { label: string; valor: ReactNode; ancho?: boolean; resaltar?: boolean }) {
  return (
    <div className={cn('min-w-0', ancho && 'col-span-2 sm:col-span-4')}>
      <p className={cn('text-[11px] font-semibold uppercase', resaltar ? 'text-primary' : 'text-muted-foreground')}>{label}</p>
      <p className="break-words text-sm font-medium uppercase tabular-nums">{valor}</p>
    </div>
  );
}

export function Tabla({ columnas, filas }: { columnas: string[]; filas: ReactNode[][] }) {
  return (
    <div className="overflow-auto rounded-md border border-border">
      <table className="w-full whitespace-nowrap text-sm tabular-nums">
        <thead className="bg-muted text-left">
          <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:text-muted-foreground">
            {columnas.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.map((f, i) => (
            <tr key={i} className="[&>td]:px-2 [&>td]:py-1">
              {f.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface Etapa {
  id: string;
  label: string;
  hecho: boolean;
  tono: Tono;
}

/** Barra de etapas: verde si ocurrió, gris si no tiene información; al tocarla baja hasta el paso. */
export function Etapas({ etapas }: { etapas: Etapa[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-6 py-2.5">
      {etapas.map((e, i) => (
        <div key={e.id} className="flex items-center gap-1">
          {i > 0 && <span className={cn('h-0.5 w-3', e.hecho ? 'bg-emerald-500' : 'bg-border')} />}
          <button
            type="button"
            onClick={() => document.getElementById(e.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors hover:shadow-sm',
              e.hecho ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-border bg-muted text-muted-foreground',
            )}
          >
            {e.hecho && <CircleCheck className="size-3.5" />}
            {e.label}
          </button>
        </div>
      ))}
    </div>
  );
}

export interface Kpi {
  label: string;
  valor: ReactNode;
  detalle?: ReactNode;
  alerta?: boolean;
}

/** Resumen de arriba: estado, cifras clave, datos y la vista de lo impreso a la derecha. */
export function Resumen({
  estado,
  kpis,
  datos,
  vista,
}: {
  estado: { label: string; className: string; detalle?: ReactNode };
  kpis: Kpi[];
  datos: ([string, ReactNode] | [string, ReactNode, 'resaltar'])[];
  vista?: ReactNode;
}) {
  return (
    <div className="grid items-start gap-4 rounded-xl border border-border bg-muted/30 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-lg px-3 py-1.5 text-sm font-bold tracking-wide', estado.className)}>{estado.label}</span>
          {estado.detalle && <span className="text-sm text-muted-foreground">{estado.detalle}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {kpis.map((k) => (
            <div key={k.label} className={cn('rounded-lg border bg-card px-3 py-2', k.alerta ? 'border-red-200' : 'border-border')}>
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">{k.label}</p>
              <p className={cn('text-xl font-bold tabular-nums', k.alerta && 'text-red-600')}>{k.valor}</p>
              {k.detalle && <p className="text-xs text-muted-foreground">{k.detalle}</p>}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {datos.map(([label, valor, marca]) => (
            <Dato key={label} label={label} valor={valor} resaltar={marca === 'resaltar'} />
          ))}
        </div>
      </div>
      {vista && <div className="flex justify-center self-center pt-6">{vista}</div>}
    </div>
  );
}

/** Botones del encabezado: copiar código, reimprimir y descargar PDF. */
export function Acciones({
  codigo,
  onReimprimir,
  onPdf,
}: {
  codigo?: string | null;
  onReimprimir?: () => Promise<string | null>;
  onPdf?: () => Promise<void>;
}) {
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<'imprimir' | 'pdf' | null>(null);
  const avisar = (ok: boolean, texto: string) => {
    setAviso({ ok, texto });
    window.setTimeout(() => setAviso(null), 3500);
  };
  return (
    <div className="flex items-center gap-1.5">
      {codigo && (
        <Button
          variant="outline"
          size="sm"
          title="Copiar código"
          onClick={() => {
            void navigator.clipboard.writeText(codigo).then(
              () => avisar(true, `Código ${codigo} copiado.`),
              () => avisar(false, 'No se pudo copiar.'),
            );
          }}
        >
          <Copy className="size-4" />
          Copiar
        </Button>
      )}
      {onReimprimir && (
        <Button
          variant="outline"
          size="sm"
          disabled={!!ocupado}
          onClick={async () => {
            setOcupado('imprimir');
            const err = await onReimprimir();
            setOcupado(null);
            avisar(!err, err ?? 'Enviado a la impresora.');
          }}
        >
          {ocupado === 'imprimir' ? <LoaderCircle className="size-4 animate-spin" /> : <Printer className="size-4" />}
          Reimprimir
        </Button>
      )}
      {onPdf && (
        <Button
          variant="outline"
          size="sm"
          disabled={!!ocupado}
          onClick={async () => {
            setOcupado('pdf');
            try {
              await onPdf();
            } catch {
              avisar(false, 'No se pudo generar el PDF.');
            } finally {
              setOcupado(null);
            }
          }}
        >
          {ocupado === 'pdf' ? <LoaderCircle className="size-4 animate-spin" /> : <FileDown className="size-4" />}
          PDF
        </Button>
      )}
      {aviso && (
        <div
          className={cn(
            'fixed left-1/2 top-24 z-[60] flex w-[26rem] max-w-[calc(100vw-3rem)] -translate-x-1/2 items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-medium shadow-lg',
            aviso.ok ? 'border-emerald-200 text-emerald-700' : 'border-red-200 text-red-700',
          )}
        >
          {aviso.ok ? <CircleCheck className="size-4 shrink-0" /> : <TriangleAlert className="size-4 shrink-0" />}
          <span className="flex-1">{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} className="opacity-60 hover:opacity-100" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
