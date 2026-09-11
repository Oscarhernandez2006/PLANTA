import { GiCow } from 'react-icons/gi';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

// Ícono de vaca: Game Icons (Delapouite / game-icons.net) vía react-icons — CC BY 3.0.
/** Ícono del módulo Recibo de Canales: res de perfil con flecha de recepción. */
export function ReciboCanalesIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className,
      )}
    >
      <GiCow className="size-full translate-y-[12%]" />
      <Download
        className="absolute -right-1.5 -top-1.5 size-[42%] text-emerald-500"
        strokeWidth={2.5}
      />
    </span>
  );
}
