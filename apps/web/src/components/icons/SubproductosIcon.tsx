import { Boxes } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Ícono del módulo Subproductos: cajas apiladas (productos derivados de la res). */
export function SubproductosIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className,
      )}
    >
      <Boxes className="size-full" strokeWidth={1.8} />
    </span>
  );
}
