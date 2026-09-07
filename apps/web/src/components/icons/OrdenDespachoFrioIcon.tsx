import { ClipboardList, Snowflake } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Ícono de Orden de Despacho Frío: orden con distintivo de cadena de frío. */
export function OrdenDespachoFrioIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className,
      )}
    >
      <ClipboardList className="size-full" strokeWidth={1.8} />
      <Snowflake
        className="absolute -right-1.5 -top-1.5 size-[42%] text-sky-400"
        strokeWidth={2.5}
      />
    </span>
  );
}
