import { cn } from '@/lib/utils';

/**
 * Ícono del módulo Rotulado Desposte: etiqueta (tag) con código de barras,
 * asociada al rotulado de producto en la sala de desposte.
 */
export function RotuladoDesposteIcon({ className }: { className?: string }) {
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
      <path d="M7.5 2.5h9a2 2 0 0 1 2 2v15l-3.25-2-3.25 2-3.25-2L5.5 19.5v-15a2 2 0 0 1 2-2Z" />
      <path d="M9 7h6M9 10.5h6M9 14h3.5" />
    </svg>
  );
}
