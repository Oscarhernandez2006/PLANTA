import { GiCow } from 'react-icons/gi';
import { Snowflake } from 'lucide-react';
import { cn } from '@/lib/utils';

// Ícono de vaca: Game Icons (Delapouite / game-icons.net) vía react-icons — CC BY 3.0.
/** Ícono del módulo Canal Fría: res de perfil con un copo de nieve (cadena de frío). */
export function CanalFriaIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className,
      )}
    >
      <GiCow className="size-full" />
      <Snowflake
        className="absolute -right-1.5 -top-1.5 size-[42%] text-sky-400"
        strokeWidth={2.5}
      />
    </span>
  );
}
