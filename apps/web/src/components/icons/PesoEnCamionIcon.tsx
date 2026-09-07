import { cn } from '@/lib/utils';

/**
 * Ícono del módulo Peso En Camión: camión (estilo lucide) sobre una
 * báscula mulera (puente-báscula).
 */
export function PesoEnCamionIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      {/* Báscula mulera (plataforma / puente-báscula) */}
      <rect x="1.5" y="18.6" width="21" height="2.4" rx="0.7" />
      <path d="M5 21v1.3M19 21v1.3" />

      {/* Camión encima de la báscula */}
      <g transform="translate(2.4 2.6) scale(0.8)" strokeWidth={2.2}>
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18H9" />
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 18.52 8H14" />
        <circle cx="17" cy="18" r="2" />
        <circle cx="7" cy="18" r="2" />
      </g>
    </svg>
  );
}
