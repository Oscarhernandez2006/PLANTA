import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type IconType = React.ComponentType<{ className?: string }>;

/** Tarjeta de total/estadística estándar de los módulos. */
export function StatCard({
  icon: Icon,
  label,
  action,
  children,
}: {
  icon: IconType;
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** Valor calculado (solo lectura). */
export function StatValue({
  icon,
  label,
  value,
  tone,
  action,
}: {
  icon: IconType;
  label: string;
  value: string;
  tone?: string;
  action?: React.ReactNode;
}) {
  return (
    <StatCard icon={icon} label={label} action={action}>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tone)}>
        {value}
      </p>
    </StatCard>
  );
}

/** Valor editable (numérico). */
export function StatInput({
  icon,
  label,
  value,
  onChange,
  onKeyboard,
  tone,
  placeholder = '0',
  action,
}: {
  icon: IconType;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onKeyboard?: () => void;
  tone?: string;
  placeholder?: string;
  action?: React.ReactNode;
}) {
  return (
    <StatCard icon={icon} label={label} action={action}>
      <input
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onDoubleClick={onKeyboard}
        className={cn(
          'mt-1 w-full bg-transparent text-2xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/40',
          tone,
        )}
      />
    </StatCard>
  );
}
