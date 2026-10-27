export function FiltroSelect({
  label,
  value,
  onChange,
  opciones,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opciones: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-sm border-2 border-border bg-card px-2 text-sm font-medium normal-case text-foreground outline-none focus:border-emerald-500"
      >
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
