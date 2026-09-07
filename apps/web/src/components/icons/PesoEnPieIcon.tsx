import { GiCow } from 'react-icons/gi';
import { cn } from '@/lib/utils';

// Ícono de vaca: Game Icons (Delapouite / game-icons.net) vía react-icons — CC BY 3.0.
/** Ícono del módulo Peso En Pie: res de perfil sobre una báscula mulera. */
export function PesoEnPieIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className,
      )}
    >
      {/* Vaca (misma que Canal Fría), apoyada sobre la báscula */}
      <GiCow className="size-[80%] -translate-y-[6%]" />

      {/* Báscula mulera (plataforma / puente-báscula) */}
      <svg
        viewBox="0 0 24 24"
        className="absolute inset-0 size-full"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="1.5" y="18.6" width="21" height="2.4" rx="0.7" />
        <path d="M5 21v1.3M19 21v1.3" />
      </svg>
    </span>
  );
}
