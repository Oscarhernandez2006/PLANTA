import { GiAnimalHide } from 'react-icons/gi';
import { cn } from '@/lib/utils';

// Ícono de piel: Game Icons (Delapouite / game-icons.net) vía react-icons — CC BY 3.0.
/** Ícono del módulo Pieles: piel de res estirada (cuero extendido). */
export function PielesIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className,
      )}
    >
      <GiAnimalHide className="size-full" />
    </span>
  );
}
