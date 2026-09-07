import { cn } from '@/lib/utils';

/** Ícono del módulo Insensibilización: cabeza de res de frente con ojos en X. */
export function InsensibilizacionIcon({ className }: { className?: string }) {
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
      {/* Cuernos */}
      <path d="M9 5.4C8.2 4 7.6 3.4 6.6 3.3M15 5.4c.8-1.4 1.4-2 2.4-2.1" />

      {/* Orejas */}
      <path d="M5.9 7.6C4.2 6.7 3 6.9 2.4 7.9c.6 1 1.9 1.4 3.3 1.1" />
      <path d="M18.1 7.6c1.7-.9 2.9-.7 3.5.3-.6 1-1.9 1.4-3.3 1.1" />

      {/* Contorno de la cara */}
      <path d="M8 6.6C6.5 6.9 5.5 8 5.5 10c0 2 1 3 2.5 3.4.2 2.1 1.8 3.6 4 3.6s3.8-1.5 4-3.6c1.5-.4 2.5-1.4 2.5-3.4 0-2-1-3.1-2.5-3.4C14.5 5.6 13.5 5.3 12 5.3s-2.5.3-4 1.3Z" />

      {/* Hocico */}
      <path d="M9.5 13.9c0-1 1.1-1.5 2.5-1.5s2.5.5 2.5 1.5c0 1.3-1.1 2-2.5 2s-2.5-.7-2.5-2Z" />
      {/* Fosas nasales */}
      <path d="M10.9 13.9c-.4 0-.7.3-.7.6M13.1 13.9c.4 0 .7.3.7.6" />

      {/* Ojos en X */}
      <g strokeWidth={1.6}>
        <path d="M8.4 9.5 10 11.1M10 9.5 8.4 11.1" />
        <path d="M14 9.5 15.6 11.1M15.6 9.5 14 11.1" />
      </g>
    </svg>
  );
}
