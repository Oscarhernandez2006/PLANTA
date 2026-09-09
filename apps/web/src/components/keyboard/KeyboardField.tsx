import { useRef } from 'react';
import { Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKeyboard } from './keyboard-context';

/**
 * Envuelve un input/textarea y agrega un botón de teclado en pantalla.
 * El campo también se puede abrir con doble clic (definido en el propio input).
 */
export function KeyboardField({
  children,
  align = 'center',
  className,
  extra,
}: {
  children: React.ReactNode;
  align?: 'center' | 'top';
  className?: string;
  extra?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const keyboard = useKeyboard();

  function open(e: React.MouseEvent) {
    // Evita el blur para que el teclado escriba en este campo.
    e.preventDefault();
    const el = ref.current?.querySelector<HTMLElement>('input, textarea');
    el?.focus();
    keyboard.open();
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      {children}
      <div
        className={cn(
          'absolute right-2 flex items-center gap-1',
          align === 'top' ? 'top-2' : 'top-1/2 -translate-y-1/2',
        )}
      >
        {extra}
        <button
          type="button"
          aria-label="Abrir teclado en pantalla"
          title="Abrir teclado en pantalla (o doble clic en el campo)"
          onMouseDown={open}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Keyboard className="size-5" />
        </button>
      </div>
    </div>
  );
}
