import { GiCow } from 'react-icons/gi';
import { PackageCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

// Ícono de vaca: Game Icons (Delapouite / game-icons.net) vía react-icons — CC BY 3.0.
/** Ícono del módulo Recibo en Canal: res de perfil con un check de recibo. */
export function CanalReciboIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className,
      )}
    >
      <GiCow className="size-full translate-y-[12%]" />
      <PackageCheck
        className="absolute -right-1.5 -top-1.5 size-[42%] text-emerald-500"
        strokeWidth={2.5}
      />
    </span>
  );
}
