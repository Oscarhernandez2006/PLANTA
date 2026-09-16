import { GiCow } from 'react-icons/gi';
import { Beef } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Ícono del módulo Recibo en Posta: res de perfil con una insignia de carne. */
export function PostaReciboIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className,
      )}
    >
      <GiCow className="size-full translate-y-[12%]" />
      <Beef
        className="absolute -right-1.5 -top-1.5 size-[42%] text-red-600"
        strokeWidth={2.5}
      />
    </span>
  );
}
