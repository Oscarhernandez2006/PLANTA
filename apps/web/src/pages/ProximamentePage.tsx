import { Construction } from 'lucide-react';

/** Pantalla de un módulo que aún está en pruebas y no se debe usar en operación. */
export function ProximamentePage({ modulo, detalle }: { modulo: string; detalle?: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card px-10 py-12 text-center shadow-sm">
        <span className="flex size-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Construction className="size-8" />
        </span>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800">
          Próximamente
        </span>
        <h1 className="text-2xl font-bold">{modulo}</h1>
        <p className="text-muted-foreground">
          {detalle ?? 'Este módulo está en construcción y en fase de pruebas. Estará disponible pronto.'}
        </p>
      </div>
    </div>
  );
}
