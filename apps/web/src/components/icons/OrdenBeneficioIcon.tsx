import { ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Ícono de Orden de Beneficio: orden/planilla de sacrificio. */
export function OrdenBeneficioIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className,
      )}
    >
      <ClipboardList className="size-full" strokeWidth={1.8} />
    </span>
  );
}
