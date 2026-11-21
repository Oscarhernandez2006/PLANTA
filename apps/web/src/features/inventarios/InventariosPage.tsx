import { useMemo, useState } from 'react';
import { Warehouse, LoaderCircle, Inbox, ChevronDown, ChevronRight, Snowflake } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { codigoBarras } from '../canal-caliente/canal-presinto-print';
import { formatOD } from '../registrar/orden-despacho-api';
import { formatOP } from '../registrar/orden-produccion-api';
import { formatDC } from '../registrar/despacho-canales-api';
import { BodegasTab } from './BodegasTab';
import { ClientesView } from './ClientesView';
import { FiltroSelect } from './FiltroSelect';
import { TableroInventario } from './TableroInventario';
import { TrazabilidadCanalDialog } from './TrazabilidadCanalDialog';
import { TrazabilidadReciboDialog } from './TrazabilidadReciboDialog';
import {
  useCava,
  useCavaSubproducto,
  CAVAS,
  CAVAS_SUBPRODUCTO,
  type CavaAnimalRow,
  type CavaSubproductoRow,
  type CavaSubproductoCategoria,
  type DestinoProducto,
} from './api';

type Tab = `cava-${string}` | `sub-${string}` | 'bodegas';
type Vista = 'tablero' | 'clientes' | 'cava';

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
    { key: 'bodegas', label: 'BODEGAS' },
  ];
  const [tab, setTab] = useState<Tab>(tabs[0].key);
  const [vista, setVista] = useState<Vista>('tablero');
  const [destinoProducto, setDestinoProducto] = useState<DestinoProducto | null>(null);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <Warehouse className="size-8 text-primary" />
        <div>
          <h1 className="text-lg font-bold">Inventarios</h1>
          <p className="text-sm text-muted-foreground">
            {vista === 'tablero'
              ? 'Resumen de planta: ocupación de cavas, existencias por cliente y alertas.'
              : vista === 'clientes'
                ? 'Existencias por cliente, bodega y orden.'
                : 'Existencias por cava de canales y subproductos, y por bodega de cada cliente.'}
          </p>
        </div>
        <div role="radiogroup" className="ml-auto flex items-center gap-1 rounded-lg bg-muted p-1">
          {(
            [
              { key: 'tablero', label: 'Tablero' },
              { key: 'clientes', label: 'Por clientes' },
              { key: 'cava', label: 'Por cava' },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              role="radio"
              aria-checked={vista === v.key}
              onClick={() => {
                setDestinoProducto(null);
                setVista(v.key);
              }}
              className={cn(
                'flex h-10 items-center rounded-md px-4 text-sm font-semibold transition-colors',
                vista === v.key
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {vista === 'tablero' ? (
        <div className="min-h-0 flex-1">
          <TableroInventario
            onAbrirProducto={(destino) => {
              setDestinoProducto(destino);
              setVista('clientes');
            }}
            onAbrirCava={(tipo, cava) => {
              setTab(tipo === 'canal' ? `cava-${cava}` : `sub-${cava}`);
              setVista('cava');
            }}
          />
        </div>
      ) : vista === 'clientes' ? (
        <div className="min-h-0 flex-1">
          <ClientesView destino={destinoProducto} />
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Snowflake className="size-4 text-primary" /> Ubicaciones de inventario
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'flex min-h-14 min-w-0 items-center justify-center rounded-lg border px-2 py-2 text-center text-xs font-semibold transition-colors last:col-span-2 xl:last:col-span-1',
                    tab === t.key
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {tab === 'bodegas' ? (
              <BodegasTab />
            ) : tab.startsWith('cava-') ? (
              <CavaTab key={tab} cava={tab.replace('cava-', '')} />
            ) : (
              <div className="h-full overflow-auto">
                <CavaSubproductoTab key={tab} cava={tab.replace('sub-', '')} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const PIEZA_LABEL: Record<CavaAnimalRow['pieza'], string> = {
  canal: 'CANAL',
  cizq: 'CIZQ',
  cder: 'CDER',
};

function CavaTab({ cava }: { cava: string }) {
  const { data, isLoading, isError } = useCava(cava);
  const [cliente, setCliente] = useState('');
  const [tipo, setTipo] = useState('');
  const [pieza, setPieza] = useState('');
  const [estado, setEstado] = useState('');
  const [trazaId, setTrazaId] = useState<string | null>(null);
  const [reciboId, setReciboId] = useState<string | null>(null);
  const rows = data ?? [];

  const clientes = useMemo(
    () => [...new Set(rows.map((r) => r.cliente))].sort(),
    [rows],
  );
  const tipos = useMemo(
    () =>
      [...new Set(rows.map((r) => r.canalAnimalTipo).filter((t): t is string => !!t))].sort(),
    [rows],
  );
  const filtradas = rows.filter(
    (r) =>
      (!cliente || r.cliente === cliente) &&
      (!tipo || r.canalAnimalTipo === tipo) &&
      (!pieza || r.pieza === pieza) &&
      (!estado || (estado === 'orden') === !!(r.enOrden || r.enDespacho)),
  );

  if (isLoading) return <Loading />;
  if (isError) return <Empty text={`No se pudo cargar la ${cava}. Intenta nuevamente.`} />;
  if (!rows.length)
    return <Empty text={`No hay animales ubicados en la ${cava}.`} />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-end gap-3 border-b border-border bg-muted/20 px-4 py-3">
        <div className="w-full space-y-1 sm:w-72">
          <label htmlFor="cava-cliente" className="text-xs font-semibold uppercase text-muted-foreground">Cliente</label>
          <Combobox
            id="cava-cliente"
            value={cliente}
            onChange={setCliente}
            options={clientes.map((c) => ({ value: c, label: c }))}
            placeholder="Todos los clientes · buscar"
            emptyText="Ningún cliente coincide"
          />
        </div>
        <FiltroSelect
          label="Tipo"
          value={tipo}
          onChange={setTipo}
          opciones={tipos.map((t) => ({ value: t, label: t.toUpperCase() }))}
        />
        <FiltroSelect
          label="Pieza"
          value={pieza}
          onChange={setPieza}
          opciones={(Object.keys(PIEZA_LABEL) as CavaAnimalRow['pieza'][]).map((p) => ({
            value: p,
            label: PIEZA_LABEL[p],
          }))}
        />
        <FiltroSelect
          label="Estado"
          value={estado}
          onChange={setEstado}
          opciones={[
            { value: 'libre', label: 'Disponible en cava' },
            { value: 'orden', label: 'En orden / proceso' },
          ]}
        />
        <div className="ml-auto text-right text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{filtradas.length}</span> canal(es) ·{' '}
          <span className="font-semibold text-foreground">{filtradas.reduce((sum, r) => sum + r.pesoKg, 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
        </div>
      </div>
      {!filtradas.length ? (
        <Empty text="No hay canales con estos filtros." />
      ) : (
    <div className="min-h-0 flex-1 overflow-auto">
    <table className="w-full whitespace-nowrap text-sm">
      <thead className="sticky top-0 z-10 bg-muted text-left">
        <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
          <th>Orden</th>
          <th>Animal</th>
          <th>Turno</th>
          <th>Barcode</th>
          <th>Cliente</th>
          <th>Fecha</th>
          <th>Tipo</th>
          <th>Pieza</th>
          <th>Estado</th>
          <th>Destino</th>
          <th>Observación</th>
          <th className="text-right">Peso (kg)</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {filtradas.map((r: CavaAnimalRow) => r.recibo ? (
          <tr
            key={r.piezaId}
            onClick={() => setReciboId(r.piezaId)}
            title="Ver trazabilidad del recibo"
            className="cursor-pointer hover:bg-muted/50 [&>td]:px-3 [&>td]:py-2"
          >
            <td className="tabular-nums">RC{r.recibo.receiptNumber}</td>
            <td className="tabular-nums">—</td>
            <td className="tabular-nums">—</td>
            <td className="font-mono tabular-nums">RC{r.recibo.receiptNumber}-{String(r.recibo.codigo).padStart(2, '0')}</td>
            <td className="min-w-48 whitespace-normal">{r.cliente}</td>
            <td className="tabular-nums">{r.date}</td>
            <td>
              <span className="rounded-sm bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-800">RECIBIDA</span>
            </td>
            <td className="text-xs font-semibold uppercase text-red-600">canal</td>
            <td>
              <EstadoCava r={r} />
            </td>
            <td className="whitespace-normal">{r.recibo.guia ? `Guía ${r.recibo.guia}` : '—'}</td>
            <td className="min-w-40 whitespace-normal uppercase">
              {[r.recibo.lote && `Lote ${r.recibo.lote}`, r.recibo.identificacion && `Ident. ${r.recibo.identificacion}`]
                .filter(Boolean)
                .join(' · ') || '—'}
            </td>
            <td className="text-right font-semibold tabular-nums">{r.pesoKg.toFixed(2)}</td>
          </tr>
        ) : (
          <tr
            key={r.piezaId}
            onClick={() => setTrazaId(r.piezaId)}
            title="Ver trazabilidad de la canal"
            className="cursor-pointer hover:bg-muted/50 [&>td]:px-3 [&>td]:py-2"
          >
            <td className="tabular-nums">{r.reference}</td>
            <td className="tabular-nums">A{String(r.sequence).padStart(2, '0')}</td>
            <td className="tabular-nums">{r.turno ?? '—'}</td>
            <td className="tabular-nums">
              {r.canalTipo
                ? codigoBarras({
                    lote: r.reference,
                    turno: r.turno ?? r.sequence,
                    canalTipo: r.canalTipo,
                    pieza: r.pieza,
                  })
                : '—'}
            </td>
            <td className="min-w-48 whitespace-normal">{r.cliente}</td>
            <td className="tabular-nums">{r.date}</td>
            <td className="text-xs uppercase">{r.canalAnimalTipo ?? '—'}</td>
            <td className="text-xs font-semibold uppercase text-red-600">
              {r.pieza}
            </td>
            <td>
              <EstadoCava r={r} />
            </td>
            <td className="whitespace-normal">{r.destino || '—'}</td>
            <td className="min-w-40 whitespace-normal">{r.observaciones || '—'}</td>
            <td className="text-right font-semibold tabular-nums">
              {r.pesoKg.toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
      )}
      {trazaId && <TrazabilidadCanalDialog piezaId={trazaId} onClose={() => setTrazaId(null)} />}
      {reciboId && <TrazabilidadReciboDialog tipo="canal" id={reciboId} onClose={() => setReciboId(null)} />}
    </div>
  );
}

function EstadoCava({ r }: { r: CavaAnimalRow }) {
  if (r.enOrden) {
    return (
      <span title="Sigue en la cava, pero ya está asignada a esta orden" className="inline-flex flex-col rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold tabular-nums text-amber-900">
        <span>{formatOD(r.enOrden.odNumber)}</span>
        {r.enOrden.opNumbers.length > 0 && <span>{r.enOrden.opNumbers.map(formatOP).join(', ')} · EN PROCESO</span>}
      </span>
    );
  }
  if (r.enDespacho) {
    return (
      <span title="Sigue en la cava hasta que se cierre la orden de despacho" className="inline-flex flex-col rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold tabular-nums text-sky-900">
        <span>{formatDC(r.enDespacho.dcNumber)}</span>
        <span>DESPACHO {r.enDespacho.tipo === 'caliente' ? 'CALIENTE' : 'FRÍO'}</span>
      </span>
    );
  }
  return <span className="text-xs font-semibold text-emerald-700">DISPONIBLE</span>;
}

function CavaSubproductoTab({ cava }: { cava: string }) {
  const { data, isLoading, isError } = useCavaSubproducto(cava);
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
  if (isError) return <Empty text={`No se pudo cargar la ${nombre}. Intenta nuevamente.`} />;
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

