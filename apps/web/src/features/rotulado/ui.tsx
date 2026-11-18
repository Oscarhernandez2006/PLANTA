import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { getSavedPrinterName, listPrinters } from '@/lib/device';
import { cn } from '@/lib/utils';

// Clave antigua propia de Rotulado; ahora se usa la impresora de Parámetros estación.
const PRINTER_KEY = 'frigo.rotulado.printer.name';
export const SIN_IMPRESORA = 'No se encontró la impresora de etiquetas (Zebra) en este equipo.';

/**
 * Impresora de etiquetas. Prioridad:
 * 1. La configurada en Configuración → Parámetros estación (vale para todos los módulos).
 * 2. La guardada antes por el propio Rotulado (compatibilidad).
 * 3. La predeterminada del equipo; si no hay, una Zebra/ZDesigner por el nombre.
 */
export function useImpresoraEtiquetas() {
  const [impresora, setImpresora] = useState(
    () => getSavedPrinterName() ?? localStorage.getItem(PRINTER_KEY) ?? '',
  );
  useEffect(() => {
    void listPrinters().then((lista) => {
      const estacion = getSavedPrinterName();
      const propia = localStorage.getItem(PRINTER_KEY);
      const elegida =
        lista.find((p) => p.name === estacion) ??
        lista.find((p) => p.name === propia) ??
        lista.find((p) => p.isDefault) ??
        lista.find((p) => /zebra|zdesigner|zpl|\bz[td]\d/i.test(p.name));
      if (elegida) setImpresora(elegida.name);
    });
  }, []);
  return impresora;
}

/** Caja con la etiqueta sobre el borde. */
export function FieldBox({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative rounded-lg border border-input bg-card px-3 pb-1 pt-2 transition-colors focus-within:border-primary',
        className,
      )}
    >
      <span className="absolute -top-2 left-2.5 max-w-[90%] truncate bg-card px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {typeof label === 'string' ? label.replace(/:\s*$/, '') : label}
      </span>
      {children}
    </div>
  );
}

export function Mensaje({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <Inbox className="size-8" />
      <p className="max-w-sm text-sm">{text}</p>
    </div>
  );
}
