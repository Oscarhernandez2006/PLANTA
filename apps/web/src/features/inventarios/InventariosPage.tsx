import { useMemo, useState } from 'react';
import { Warehouse, LoaderCircle, Inbox, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCava,
  useCavaSubproducto,
  CAVAS,
  CAVAS_SUBPRODUCTO,
  type CavaAnimalRow,
  type CavaSubproductoRow,
  type CavaSubproductoCategoria,
} from './api';

type Tab = `cava-${string}` | `sub-${string}`;

function hora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fechaHora(dateStr: string, iso: string | null) {
  if (!iso) return dateStr;
  return `${dateStr} ${hora(iso)}`;
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <LoaderCircle className="size-6 animate-spin" />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <Inbox className="size-8" />
      <p className="max-w-xs text-sm">{text}</p>
    </div>
  );
}

export function InventariosPage() {
  const tabs: { key: Tab; label: string }[] = [
    ...CAVAS.map((c) => ({ key: `cava-${c}` as Tab, label: c })),
    ...CAVAS_SUBPRODUCTO.map((c) => ({
      key: `sub-${c}` as Tab,
      label: c === '3' ? 'CAVA SUBPRODUCTO DESPACHO' : `CAVA SUBPRODUCTO ${c}`,
    })),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0].key);

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-5xl flex-col gap-2 p-2">
      <div className="flex items-center gap-2 rounded-sm border-2 border-border bg-card p-3">
        <Warehouse className="size-8 text-foreground" />
        <div>
          <h1 className="text-lg font-bold">Inventarios</h1>
          <p className="text-sm text-muted-foreground">
            Existencias por cava de canales y subproductos.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap overflow-hidden rounded-sm border-2 border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 border-r-2 border-b-2 border-border px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide transition-colors last:border-r-0',
              tab === t.key
                ? 'bg-background text-foreground shadow-[inset_0_-3px_0_0] shadow-emerald-600'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto rounded-sm border-2 border-border bg-card">
        {tab.startsWith('cava-') ? (
          <CavaTab cava={tab.replace('cava-', '')} />
        ) : (
          <CavaSubproductoTab cava={tab.replace('sub-', '')} />
        )}
      </div>
    </div>
  );
}

function CavaTab({ cava }: { cava: string }) {
  const { data, isLoading } = useCava(cava);
  if (isLoading) return <Loading />;
  const rows = data ?? [];
  if (!rows.length)
    return <Empty text={`No hay animales ubicados en la ${cava}.`} />;
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-muted/60 text-left">
        <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
          <th>Orden</th>
          <th>Cliente</th>
          <th>Fecha</th>
          <th>Tipo</th>
          <th>Pieza</th>
          <th>Destino</th>
          <th className="text-right">Peso (kg)</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((r: CavaAnimalRow) => (
          <tr key={r.piezaId} className="[&>td]:px-3 [&>td]:py-2">
            <td className="tabular-nums">{r.reference}</td>
            <td>{r.cliente}</td>
            <td className="tabular-nums">{r.date}</td>
            <td className="text-xs uppercase">{r.canalAnimalTipo ?? '—'}</td>
            <td className="text-xs font-semibold uppercase text-red-600">
              {r.pieza}
            </td>
            <td>{r.destino || '—'}</td>
            <td className="text-right font-semibold tabular-nums">
              {r.pesoKg.toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CavaSubproductoTab({ cava }: { cava: string }) {
  const { data, isLoading } = useCavaSubproducto(cava);
  const nombre = cava === '3' ? 'Cava Subproducto Despacho' : `Cava Subproducto ${cava}`;
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  // Una sola línea por cliente + fecha (igual que en Subproductos: los lotes
  // del mismo cliente el mismo día quedan amarrados). Al presionar, se
  // despliegan los productos agrupados de ese grupo en esta cava.
  const grupos = useMemo(() => {
    const rows = data ?? [];
    const map = new Map<
      string,
      {
        cliente: string;
        date: string;
        references: Set<number>;
        items: CavaSubproductoRow[];
      }
    >();
    for (const r of rows) {
      const key = `${r.cliente}|${r.date}`;
      const g = map.get(key);
      if (g) {
        g.references.add(r.reference);
        g.items.push(r);
      } else {
        map.set(key, {
          cliente: r.cliente,
          date: r.date,
          references: new Set([r.reference]),
          items: [r],
        });
      }
    }
    return [...map.entries()].map(([key, g]) => ({
      key,
      cliente: g.cliente,
      date: g.date,
      references: [...g.references].sort((a, b) => a - b),
      items: g.items,
    }));
  }, [data]);

  if (isLoading) return <Loading />;
  if (!grupos.length)
    return <Empty text={`No hay subproductos ubicados en la ${nombre}.`} />;

  function toggle(key: string) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <ul className="divide-y divide-border">
      {grupos.map((g) => {
        const abierto = abiertos.has(g.key);
        // Productos agrupados (uno por tipo): suma kilos o cuenta unidades.
        const porProducto = new Map<
          string,
          {
            label: string;
            unidad: 'unidad' | 'kg';
            categoria: CavaSubproductoCategoria;
            unidades: number;
            kg: number;
            registradoAt: string | null;
          }
        >();
        for (const it of g.items) {
          const acc = porProducto.get(it.tipo) ?? {
            label: it.label,
            unidad: it.unidad,
            categoria: it.categoria,
            unidades: 0,
            kg: 0,
            registradoAt: it.registradoAt,
          };
          if (it.unidad === 'unidad') acc.unidades += it.cantidad ?? 1;
          else acc.kg += it.pesoKg ?? 0;
          if (
            it.registradoAt &&
            (!acc.registradoAt || it.registradoAt > acc.registradoAt)
          ) {
            acc.registradoAt = it.registradoAt;
          }
          porProducto.set(it.tipo, acc);
        }
        const productos = [...porProducto.values()];
        // Se divide por categoría, igual que el checklist de Subproductos:
        // cabeza_patas se agrupa dentro de Retomas.
        const categorias: { key: CavaSubproductoCategoria[]; label: string }[] = [
          { key: ['viscera_roja'], label: 'Vísceras rojas' },
          { key: ['viscera_blanca'], label: 'Vísceras blancas' },
          { key: ['retoma', 'cabeza_patas'], label: 'Retomas' },
        ];

        return (
          <li key={g.key}>
            <button
              onClick={() => toggle(g.key)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
            >
              <div className="flex items-center gap-2">
                {abierto ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
                <div>
                  <div className="font-semibold">
                    N.º {g.references.join(', ')} · {g.cliente}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {g.date} · {productos.length} producto
                    {productos.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            </button>
            {abierto &&
              categorias.map((cat) => {
                const items = productos.filter((p) => cat.key.includes(p.categoria));
                if (!items.length) return null;
                return (
                  <div key={cat.label}>
                    <div className="bg-muted/40 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {cat.label} ({items.length})
                    </div>
                    <table className="w-full text-sm">
                      <thead className="text-left">
                        <tr className="[&>th]:px-4 [&>th]:py-1.5 [&>th]:text-xs [&>th]:font-semibold">
                          <th>Producto</th>
                          <th className="text-right">Unidades</th>
                          <th className="text-right">Kilos</th>
                          <th>Fecha y hora de ingreso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items.map((p) => (
                          <tr key={p.label} className="[&>td]:px-4 [&>td]:py-1.5">
                            <td>{p.label}</td>
                            <td className="text-right tabular-nums">
                              {p.unidad === 'unidad' ? p.unidades : '—'}
                            </td>
                            <td className="text-right font-semibold tabular-nums">
                              {p.unidad === 'kg' ? p.kg.toFixed(2) : '—'}
                            </td>
                            <td className="tabular-nums">
                              {fechaHora(g.date, p.registradoAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
          </li>
        );
      })}
    </ul>
  );
}

