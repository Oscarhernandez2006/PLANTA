import { useState } from 'react';
import { Warehouse, LoaderCircle, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCava,
  useCavaSubproducto,
  CAVAS,
  CAVAS_SUBPRODUCTO,
  type CavaAnimalRow,
  type CavaSubproductoRow,
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
    ...CAVAS.map((c) => ({
      key: `cava-${c}` as Tab,
      label: c === '6' ? 'SALA DE OREO' : c === '7' ? 'CAVA DESPACHO' : `CAVA ${c}`,
    })),
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
  const nombre =
    cava === '6' ? 'Sala de Oreo' : cava === '7' ? 'Cava Despacho' : `Cava ${cava}`;
  if (isLoading) return <Loading />;
  const rows = data ?? [];
  if (!rows.length)
    return <Empty text={`No hay animales ubicados en la ${nombre}.`} />;
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-muted/60 text-left">
        <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
          <th>Orden</th>
          <th>Cliente</th>
          <th>Fecha</th>
          <th>Tipo</th>
          <th>Destino</th>
          <th className="text-center">Piezas</th>
          <th className="text-right">Peso total (kg)</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((r: CavaAnimalRow) => (
          <tr key={r.eventoId} className="[&>td]:px-3 [&>td]:py-2">
            <td className="tabular-nums">{r.reference}</td>
            <td>{r.cliente}</td>
            <td className="tabular-nums">{r.date}</td>
            <td className="text-xs uppercase">{r.canalAnimalTipo ?? '—'}</td>
            <td>{r.destino || '—'}</td>
            <td className="text-center tabular-nums">{r.piezas}</td>
            <td className="text-right font-semibold tabular-nums">
              {r.pesoTotalKg.toFixed(2)}
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
  if (isLoading) return <Loading />;
  const rows = data ?? [];
  if (!rows.length)
    return (
      <Empty text={`No hay subproductos ubicados en la ${nombre}.`} />
    );
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-muted/60 text-left">
        <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
          <th>Cliente</th>
          <th>Lote / Orden</th>
          <th>Fecha</th>
          <th>Producto</th>
          <th className="text-right">Unidades</th>
          <th className="text-right">Kilos</th>
          <th>Fecha y hora de ingreso</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((r: CavaSubproductoRow) => (
          <tr key={r.itemId} className="[&>td]:px-3 [&>td]:py-2">
            <td>{r.cliente}</td>
            <td className="tabular-nums">{r.reference}</td>
            <td className="tabular-nums">{r.date}</td>
            <td>{r.label}</td>
            <td className="text-right tabular-nums">
              {r.unidad === 'unidad' ? (r.cantidad ?? 1) : '—'}
            </td>
            <td className="text-right font-semibold tabular-nums">
              {r.unidad === 'kg' && r.pesoKg != null ? r.pesoKg.toFixed(2) : '—'}
            </td>
            <td className="tabular-nums">{fechaHora(r.date, r.registradoAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
