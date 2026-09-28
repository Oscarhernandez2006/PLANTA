import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Caja con la etiqueta sobre el borde (estilo FrigoAPP). */
export function FieldBox({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative rounded-sm border-2 border-border bg-card px-3 pb-1 pt-1',
        className,
      )}
    >
      <span className="absolute -top-3 left-3 bg-background px-1.5 text-sm font-medium">
        {label}
      </span>
      {children}
    </div>
  );
}

export function Mensaje({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <Inbox className="size-8" />
      <p className="max-w-sm text-sm">{text}</p>
    </div>
  );
}
