import { useState } from 'react';
import { Inbox, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProductos, type ProductoCategoria } from '../api';

const CATEGORIAS: { value: ProductoCategoria; label: string }[] = [
  { value: 'materia_prima', label: 'Materias Primas' },
  { value: 'subproducto', label: 'Subproductos' },
  { value: 'terminado', label: 'Terminados' },
];

const LETRAS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

export function ProductosTab({
  onPick,
}: {
  onPick: (p: { codigo: string | null; nombre: string }) => void;
}) {
  const [categoria, setCategoria] = useState<ProductoCategoria>('materia_prima');
  const [letra, setLetra] = useState('A');

  const productos = useProductos(categoria, letra, '');
  const rows = productos.data ?? [];

  return (
    <div className="space-y-4">
      {/* Categorías */}
      <div className="grid grid-cols-3 gap-2">
        {CATEGORIAS.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategoria(c.value)}
            className={cn(
              'h-11 rounded-md border text-sm font-semibold uppercase tracking-wide transition-colors',
              categoria === c.value
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-input bg-card text-foreground hover:bg-muted/60',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Grid de productos */}
      <div className="min-h-[320px]">
        {productos.isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <Inbox className="size-8" />
            <p className="text-sm font-medium">Sin productos con la letra «{letra}»</p>
            <p className="text-sm">
              Cargá el catálogo de productos para este grupo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rows.map((p) => (
              <button
                key={p.id}
                onClick={() => onPick({ codigo: p.codigo, nombre: p.nombre })}
                className="h-11 rounded-md border border-input bg-card px-3 text-sm font-medium transition-colors hover:bg-muted/60"
              >
                {p.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Alfabeto */}
      <div className="flex flex-wrap gap-1.5">
        {LETRAS.map((l) => (
          <button
            key={l}
            onClick={() => setLetra(l)}
            className={cn(
              'size-9 rounded-md border text-sm font-semibold transition-colors',
              letra === l
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-card hover:bg-muted/60',
            )}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
