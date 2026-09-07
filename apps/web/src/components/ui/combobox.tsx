import { useRef, useState } from 'react';
import { Check, ChevronsUpDown, Keyboard, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
}

const MAX_VISIBLE = 50;

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Buscar…',
  emptyText = 'Sin resultados',
  onKeyboard,
  id,
  className,
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  onKeyboard?: () => void;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const display = open ? query : (selected?.label ?? '');
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;
  const shown = filtered.slice(0, MAX_VISIBLE);

  function select(o: ComboboxOption) {
    onChange(o.value);
    setQuery('');
    setOpen(false);
  }

  function clear() {
    onChange('');
    setQuery('');
    inputRef.current?.focus();
    setOpen(true);
  }

  const showClear = !!value || query.trim().length > 0;

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          value={display}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          className={cn(
            'flex h-11 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            onKeyboard ? 'pr-[4.5rem]' : 'pr-[4.25rem]',
          )}
        />
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {showClear && (
            <button
              type="button"
              aria-label="Borrar selección"
              onMouseDown={(e) => {
                e.preventDefault();
                clear();
              }}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
          {onKeyboard ? (
            <button
              type="button"
              aria-label="Abrir teclado en pantalla"
              // Evita el blur para que el teclado escriba en este input.
              onMouseDown={(e) => {
                e.preventDefault();
                inputRef.current?.focus();
                setOpen(true);
                onKeyboard();
              }}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Keyboard className="size-5" />
            </button>
          ) : (
            <ChevronsUpDown className="pointer-events-none mr-1 size-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-lg">
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {emptyText}
            </li>
          ) : (
            shown.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(o);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent"
                >
                  <Check
                    className={cn(
                      'size-4 shrink-0 text-primary',
                      o.value === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            ))
          )}
          {filtered.length > MAX_VISIBLE && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Mostrando {MAX_VISIBLE} de {filtered.length}. Seguí escribiendo
              para filtrar…
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
