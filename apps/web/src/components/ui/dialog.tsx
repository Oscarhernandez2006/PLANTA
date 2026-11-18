import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** El contenido se desplaza dentro de la tarjeta (el encabezado queda fijo). */
  scrollInterno?: boolean;
  /** Botones a la izquierda del de cerrar. */
  acciones?: React.ReactNode;
  /** Botón "←" antes del título para volver a la vista anterior. */
  volver?: { label: string; onClick: () => void };
  /** Franja fija bajo el encabezado (no se desplaza con el contenido). */
  subencabezado?: React.ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  scrollInterno,
  acciones,
  volver,
  subencabezado,
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 mt-8 w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl',
          'duration-200 animate-in fade-in-0 zoom-in-95',
          scrollInterno && 'flex max-h-[calc(100vh-6rem)] flex-col',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-6 pb-4">
          <div className="min-w-0 space-y-1">
            {volver && (
              <button
                type="button"
                onClick={volver.onClick}
                className="mb-1 flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                ← {volver.label}
              </button>
            )}
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {acciones}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X />
            </Button>
          </div>
        </div>
        {subencabezado && <div className="shrink-0 border-b border-border bg-muted/20">{subencabezado}</div>}
        <div className={cn('p-6', scrollInterno && 'scrollbar-app min-h-0 flex-1 overflow-y-auto')}>{children}</div>
      </div>
    </div>
  );
}
