import { Delete, Eraser } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NumpadProps {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  disabled?: boolean;
  className?: string;
}

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Teclado numérico grande, pensado para pantallas táctiles sin teclado físico. */
export function Numpad({
  onDigit,
  onBackspace,
  onClear,
  disabled,
  className,
}: NumpadProps) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-border bg-gradient-to-b from-muted/50 to-muted/20 p-3 shadow-sm sm:p-4',
        className,
      )}
    >
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {keys.map((k) => (
          <NumKey key={k} onClick={() => onDigit(k)} disabled={disabled}>
            {k}
          </NumKey>
        ))}
        <NumKey
          onClick={onClear}
          disabled={disabled}
          ariaLabel="Vaciar todo"
          variant="clear"
        >
          <Eraser className="size-6" />
        </NumKey>
        <NumKey onClick={() => onDigit('0')} disabled={disabled}>
          0
        </NumKey>
        <NumKey
          onClick={onBackspace}
          disabled={disabled}
          ariaLabel="Borrar"
          variant="muted"
        >
          <Delete className="size-7" />
        </NumKey>
      </div>
    </div>
  );
}

function NumKey({
  children,
  onClick,
  disabled,
  ariaLabel,
  variant = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  variant?: 'default' | 'muted' | 'clear';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'flex h-16 select-none items-center justify-center rounded-2xl text-2xl font-semibold sm:h-[4.5rem] sm:text-3xl',
        'border shadow-sm transition-all duration-100',
        'active:scale-[0.96] active:shadow-none disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        variant === 'default' &&
          'border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent active:bg-accent',
        variant === 'muted' &&
          'border-transparent bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground',
        variant === 'clear' &&
          'border-transparent bg-secondary text-amber-600 hover:bg-amber-50 hover:text-amber-700',
      )}
    >
      {children}
    </button>
  );
}
