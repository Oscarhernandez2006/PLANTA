import { GiCow } from 'react-icons/gi';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

// Ícono de vaca: Game Icons (Delapouite / game-icons.net) vía react-icons — CC BY 3.0.
/** Ícono del módulo Canal Caliente: res de perfil con una llama (canal en caliente). */
export function CanalCalienteIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className,
      )}
    >
      <GiCow className="size-full" />
      <Flame
        className="absolute -right-1.5 -top-1.5 size-[42%] text-orange-500"
        strokeWidth={2.5}
      />
    </span>
  );
}
