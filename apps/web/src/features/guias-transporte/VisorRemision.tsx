import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, LoaderCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDC } from '../registrar/despacho-canales-api';
import { descargarGuiaDespacho, urlGuiaDespacho, type VistaRemision } from './api';

const VISTAS: { id: VistaRemision; label: string; ayuda: string }[] = [
  { id: 'cliente', label: 'Vista cliente', ayuda: 'Consolidado por producto y lote' },
  { id: 'interna', label: 'Vista interna', ayuda: 'Código de barras por código de barras' },
];

/** URL (blob) del PDF de la remisión en la vista pedida; se libera al cambiar o desmontar. */
export function useUrlRemision(dcId: string, operario: string, vista: VistaRemision, pickingId?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    let creada: string | null = null;
    setUrl(null);
    setError(false);
    if (!dcId) return;
    urlGuiaDespacho(dcId, operario, vista, pickingId)
      .then((u) => {
        creada = u;
        if (vivo) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [dcId, operario, vista, pickingId]);

  return { url, error };
}

/** Pestañas para alternar entre la vista cliente y la vista interna de la remisión. */
export function PestanasVista({ vista, onChange }: { vista: VistaRemision; onChange: (v: VistaRemision) => void }) {
  return (
    <div className="flex w-fit rounded-lg border bg-muted/40 p-0.5" role="tablist">
      {VISTAS.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={vista === v.id}
          title={v.ayuda}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            vista === v.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onChange(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

/** Visor embebido del PDF (con carga y error). */
export function MarcoPdf({ url, error, className }: { url: string | null; error: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center bg-muted', className)}>
      {url ? (
        <iframe key={url} title="Remisión" src={`${url}#view=FitH`} className="h-full w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">No se pudo generar la remisión.</p>
      ) : (
        <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

/** Botón de descarga del PDF de la remisión en la vista actual. */
export function DescargarRemision({
  dcId,
  operario,
  vista,
  pickingId,
  disabled,
}: {
  dcId: string;
  operario: string;
  vista: VistaRemision;
  pickingId?: string | null;
  disabled?: boolean;
}) {
  const [descargando, setDescargando] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
      disabled={disabled || descargando}
      onClick={() => {
        setDescargando(true);
        void descargarGuiaDespacho(dcId, operario, vista, pickingId).finally(() => setDescargando(false));
      }}
    >
      {descargando ? <LoaderCircle className="size-4 animate-spin" /> : <FileDown className="size-4 text-red-700" />}
      PDF
    </button>
  );
}

/**
 * Visor a pantalla completa de la remisión (guía de transporte) de una orden DC, con
 * pestañas vista cliente / vista interna. En portal para quedar encima de otros modales.
 */
export function VisorRemision({
  dcId,
  dcNumber,
  pickingId,
  titulo,
  operario,
  vistaInicial = 'cliente',
  onClose,
}: {
  dcId: string;
  dcNumber?: number;
  /** Remisión de una tienda (despacho con remisiones por tienda). */
  pickingId?: string | null;
  /** Código a mostrar en el título (p. ej. DC3-GM1-T01). */
  titulo?: string | null;
  operario: string;
  vistaInicial?: VistaRemision;
  onClose: () => void;
}) {
  const [vista, setVista] = useState<VistaRemision>(vistaInicial);
  const { url, error } = useUrlRemision(dcId, operario, vista, pickingId);

  useEffect(() => {
    // Captura en document para que Esc cierre solo el visor y no el modal de abajo.
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950/70 p-4 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold">
              Remisión / guía de transporte
              {titulo ? ` · ${titulo}` : dcNumber != null && ` · ${formatDC(dcNumber)}`}
            </h3>
            <PestanasVista vista={vista} onChange={setVista} />
          </div>
          <div className="flex items-center gap-2">
            <DescargarRemision dcId={dcId} operario={operario} vista={vista} pickingId={pickingId} disabled={!url} />
            <button type="button" title="Cerrar (Esc)" className="rounded-md p-1 hover:bg-muted" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <MarcoPdf url={url} error={error} className="min-h-0 flex-1" />
      </div>
    </div>,
    document.body,
  );
}
