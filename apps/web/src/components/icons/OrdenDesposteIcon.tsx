import { ClipboardList, Slice } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Ícono de Orden de Desposte: orden con distintivo de corte/desposte. */
export function OrdenDesposteIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className,
      )}
    >
      <ClipboardList className="size-full" strokeWidth={1.8} />
      <Slice
        className="absolute -right-1.5 -top-1.5 size-[44%] text-rose-500"
        strokeWidth={2.5}
      />
    </span>
  );
}
