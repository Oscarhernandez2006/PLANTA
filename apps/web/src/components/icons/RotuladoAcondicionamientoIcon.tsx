import { cn } from '@/lib/utils';

/**
 * Ícono del módulo Rotulado Acondicionamiento: caja/empaque con etiqueta,
 * asociada al rotulado tras el acondicionamiento del producto.
 */
export function RotuladoAcondicionamientoIcon({
  className,
}: {
  className?: string;
}) {
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
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
      <path d="m7.5 5.25 9 4.5" />
    </svg>
  );
}
