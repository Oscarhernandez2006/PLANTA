import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { listPrinters } from '@/lib/device';
import { cn } from '@/lib/utils';

const PRINTER_KEY = 'frigo.rotulado.printer.name';
export const SIN_IMPRESORA = 'No se encontró la impresora de etiquetas (Zebra) en este equipo.';

/** Impresora de etiquetas: la guardada si sigue instalada, si no la Zebra o la predeterminada. */
export function useImpresoraEtiquetas() {
  const [impresora, setImpresora] = useState(() => localStorage.getItem(PRINTER_KEY) ?? '');
  useEffect(() => {
    void listPrinters().then((lista) => {
      const guardada = localStorage.getItem(PRINTER_KEY);
      const elegida =
        lista.find((p) => p.name === guardada) ??
        lista.find((p) => /zebra|zdesigner/i.test(p.name)) ??
        lista.find((p) => p.isDefault);
      if (elegida) setImpresora(elegida.name);
    });
  }, []);
  return impresora;
}

/** Caja con la etiqueta sobre el borde (estilo FrigoAPP). */
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
        'relative rounded-sm border-2 border-border bg-card px-3 pb-1 pt-1',
        className,
      )}
    >
      <span className="absolute -top-3 left-3 bg-background px-1.5 text-sm font-medium">
        {label}
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
