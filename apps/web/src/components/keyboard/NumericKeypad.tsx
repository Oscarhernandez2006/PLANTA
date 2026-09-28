import { useEffect, useRef, useState } from 'react';
import { Check, Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

const TECLAS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', '.'];

/**
 * Teclado numérico en pantalla (dígitos, punto y coma) anclado debajo del campo.
 * El contenedor del campo debe ser `relative`.
 */
export function NumericKeypad({
  value,
  onChange,
  onClose,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // La primera tecla reemplaza el valor (p. ej. "0.00").
  const [nuevo, setNuevo] = useState(true);

  useEffect(() => {
    function fuera(e: PointerEvent) {
      const padre = ref.current?.parentElement;
      if (padre && !padre.contains(e.target as Node)) onClose();
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Enter') onClose();
    }
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [onClose]);

  function pulsar(t: string) {
    const base = nuevo ? '' : value;
    setNuevo(false);
    if (t === ',' || t === '.') {
      // Siempre se guarda con punto.
      if (base.includes('.')) return;
      onChange((base || '0') + '.');
      return;
    }
    onChange(base === '0' ? t : base + t);
  }

  const btn =
    'flex h-14 items-center justify-center rounded-md border-2 border-border bg-card text-2xl font-semibold tabular-nums shadow-sm active:bg-muted hover:bg-muted';

  return (
    <div
      ref={ref}
      // Evita que el campo pierda el foco al tocar las teclas.
      onPointerDown={(e) => e.preventDefault()}
      className={cn(
        'absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border-2 border-border bg-background p-2 shadow-xl',
        className,
      )}
    >
      <div className="grid grid-cols-3 gap-2">
        {TECLAS.map((t) => (
          <button key={t} type="button" onClick={() => pulsar(t)} className={btn}>
            {t}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setNuevo(false);
            onChange('');
          }}
          className={cn(btn, 'text-base font-bold uppercase text-red-600')}
        >
          C
        </button>
        <button
          type="button"
          onClick={() => {
            setNuevo(false);
            onChange(value.slice(0, -1));
          }}
          className={btn}
          aria-label="Borrar"
        >
          <Delete className="size-6" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className={cn(btn, 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700')}
          aria-label="Aceptar"
        >
          <Check className="size-7" />
        </button>
      </div>
    </div>
  );
}
