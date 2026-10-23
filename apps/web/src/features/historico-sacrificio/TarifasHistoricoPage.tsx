import { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, Download, Inbox, LoaderCircle, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { cn } from '@/lib/utils';
import { pesos, useTarifasSacrificio, type TarifaSacrificio } from './beneficio-api';
import { CONCEPTOS, useTarifasSubproductos, type TarifaSubproducto } from './retomas-api';
import {
  useBorrarTarifaSacrificio,
  useBorrarTarifaSubproducto,
  useGuardarTarifaSacrificio,
  useGuardarTarifaSubproducto,
} from './tarifas-api';

function errorDe(err: unknown, porDefecto: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
  return (Array.isArray(msg) ? msg.join(' ') : msg) || porDefecto;
}

const dec = (v: string) => v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
const monto = (v: number) => (v ? pesos(v) : '$ -');

async function exportarTarifas(sacrificio: TarifaSacrificio[], subproductos: TarifaSubproducto[]) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('TARIFAS');
  ws.columns = [{ width: 45 }, { width: 18 }, { width: 3 }, { width: 45 }, ...CONCEPTOS.map(() => ({ width: 14 }))];
  const head = ws.addRow(['CLIENTE', 'VALOR BASE', '', 'CLIENTES', ...CONCEPTOS.map(([, , , t]) => t.toUpperCase())]);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((c, col) => {
    if (col !== 3) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  });
  const filas = Math.max(sacrificio.length, subproductos.length);
  for (let i = 0; i < filas; i++) {
    const a = sacrificio[i];
    const b = subproductos[i];
    const r = ws.addRow([
      a?.cliente ?? '',
      a?.valorBase ?? '',
      '',
      b?.cliente ?? '',
      ...CONCEPTOS.map(([, , clave]) => (b ? b[clave] : '')),
    ]);
    [2, 5, 6, 7, 8, 9, 10].forEach((c) => (r.getCell(c).numFmt = '"$" #,##0'));
  }
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'TARIFAS.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

export function TarifasHistoricoPage() {
  const sacrificio = useTarifasSacrificio();
  const subproductos = useTarifasSubproductos();
  const borrarSac = useBorrarTarifaSacrificio();
  const borrarSub = useBorrarTarifaSubproducto();
  const [buscar, setBuscar] = useState('');
  const [selSac, setSelSac] = useState<TarifaSacrificio | null>(null);
  const [selSub, setSelSub] = useState<TarifaSubproducto | null>(null);
  const [formSac, setFormSac] = useState<{ t: TarifaSacrificio | null } | null>(null);
  const [formSub, setFormSub] = useState<{ t: TarifaSubproducto | null } | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 4000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const q = buscar.trim().toUpperCase();
  const listaSac = useMemo(
    () => (sacrificio.data ?? []).filter((t) => !q || t.cliente.toUpperCase().includes(q)),
    [sacrificio.data, q],
  );
  const listaSub = useMemo(
    () => (subproductos.data ?? []).filter((t) => !q || t.cliente.toUpperCase().includes(q)),
    [subproductos.data, q],
  );

  async function borrar(tipo: 'sac' | 'sub') {
    const t = tipo === 'sac' ? selSac : selSub;
    if (!t) return;
    const tabla = tipo === 'sac' ? 'sacrificio' : 'subproductos';
    if (!window.confirm(`¿Seguro que querés borrar la tarifa de ${tabla} de ${t.cliente}?`)) return;
    try {
      if (tipo === 'sac') {
        await borrarSac.mutateAsync(t.id);
        setSelSac(null);
      } else {
        await borrarSub.mutateAsync(t.id);
        setSelSub(null);
      }
      setAviso({ ok: true, texto: `Tarifa de ${tabla} de ${t.cliente} borrada.` });
    } catch (err) {
      setAviso({ ok: false, texto: errorDe(err, 'No se pudo borrar la tarifa.') });
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      await exportarTarifas(sacrificio.data ?? [], subproductos.data ?? []);
    } finally {
      setExportando(false);
    }
  }

  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
  const td = 'whitespace-nowrap px-2 py-2 tabular-nums';
  const fila = (sel: boolean) =>
    cn('cursor-pointer [&>td]:border-b [&>td]:border-border', sel ? 'bg-sky-100' : 'hover:bg-muted/40');

  const acciones = (tipo: 'sac' | 'sub') => {
    const sel = tipo === 'sac' ? selSac : selSub;
    const pend = tipo === 'sac' ? borrarSac.isPending : borrarSub.isPending;
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-10" onClick={() => (tipo === 'sac' ? setFormSac({ t: null }) : setFormSub({ t: null }))}>
          <Plus className="size-4" />
          Nueva
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-10"
          title="Editar tarifa seleccionada"
          disabled={!sel}
          onClick={() => (tipo === 'sac' ? setFormSac({ t: selSac }) : setFormSub({ t: selSub }))}
        >
          <Pencil className="size-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-10 text-red-600 hover:bg-red-50 hover:text-red-700"
          title="Borrar tarifa seleccionada"
          disabled={!sel || pend}
          onClick={() => borrar(tipo)}
        >
          {pend ? <LoaderCircle className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
        </Button>
      </div>
    );
  };

  const vacio = (cols: number, cargando: boolean) => (
    <tr>
      <td colSpan={cols} className="py-16">
        <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
          {cargando ? <LoaderCircle className="size-6 animate-spin" /> : <Inbox className="size-8" />}
          {!cargando && <p className="text-sm font-medium">Sin tarifas</p>}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BadgeDollarSign className="size-9" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tarifa</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Histórico sacrificio — valores por cliente para beneficio y retomas.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-10 pl-9" placeholder="Buscar cliente…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-6"
            title="Exportar a Excel"
            disabled={exportando || !sacrificio.data}
            onClick={exportar}
          >
            {exportando ? <LoaderCircle className="animate-spin" /> : <Download />}
          </Button>
        </div>
      </div>

      {aviso && (
        <div
          className={cn(
            'shrink-0 rounded-lg border px-4 py-3 text-sm font-medium',
            aviso.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700',
          )}
        >
          {aviso.texto}
        </div>
      )}

      <p className="shrink-0 text-sm text-muted-foreground">
        Un cambio de tarifa aplica a los registros que se creen o editen desde ahora; los ya guardados conservan su valor.
      </p>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,9fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border p-3">
            <div>
              <h2 className="font-semibold">Tarifa de sacrificio</h2>
              <p className="text-xs text-muted-foreground">Valor por res en Beneficio · {listaSac.length} clientes</p>
            </div>
            {acciones('sac')}
          </div>
          <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className={cn(th, 'text-left')}>Cliente</th>
                  <th className={cn(th, 'text-right')}>Valor base</th>
                </tr>
              </thead>
              <tbody>
                {listaSac.length === 0
                  ? vacio(2, sacrificio.isLoading)
                  : listaSac.map((t) => (
                      <tr
                        key={t.id}
                        className={fila(selSac?.id === t.id)}
                        onClick={() => setSelSac(selSac?.id === t.id ? null : t)}
                        onDoubleClick={() => setFormSac({ t })}
                      >
                        <td className={cn(td, 'whitespace-normal font-medium')}>{t.cliente}</td>
                        <td className={cn(td, 'text-right font-semibold')}>{monto(t.valorBase)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border p-3">
            <div>
              <h2 className="font-semibold">Tarifa de subproductos</h2>
              <p className="text-xs text-muted-foreground">Valores unitarios en Retomas · {listaSub.length} clientes</p>
            </div>
            {acciones('sub')}
          </div>
          <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className={cn(th, 'text-left')}>Cliente</th>
                  {CONCEPTOS.map(([q, , , t]) => (
                    <th key={q} className={cn(th, 'text-right')}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listaSub.length === 0
                  ? vacio(1 + CONCEPTOS.length, subproductos.isLoading)
                  : listaSub.map((t) => (
                      <tr
                        key={t.id}
                        className={fila(selSub?.id === t.id)}
                        onClick={() => setSelSub(selSub?.id === t.id ? null : t)}
                        onDoubleClick={() => setFormSub({ t })}
                      >
                        <td className={cn(td, 'whitespace-normal font-medium')}>{t.cliente}</td>
                        {CONCEPTOS.map(([q, , clave]) => (
                          <td key={q} className={cn(td, 'text-right', !t[clave] && 'text-muted-foreground')}>{monto(t[clave])}</td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {formSac && (
        <TarifaSacrificioForm
          tarifa={formSac.t}
          onClose={() => setFormSac(null)}
          onSaved={(cliente, nueva) => {
            setFormSac(null);
            setSelSac(null);
            setAviso({ ok: true, texto: `Tarifa de sacrificio de ${cliente} ${nueva ? 'agregada' : 'actualizada'}.` });
          }}
        />
      )}
      {formSub && (
        <TarifaSubproductoForm
          tarifa={formSub.t}
          onClose={() => setFormSub(null)}
          onSaved={(cliente, nueva) => {
            setFormSub(null);
            setSelSub(null);
            setAviso({ ok: true, texto: `Tarifa de subproductos de ${cliente} ${nueva ? 'agregada' : 'actualizada'}.` });
          }}
        />
      )}
    </div>
  );
}

function CampoCliente({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const keyboard = useKeyboard();
  return (
    <div className="space-y-1">
      <Label htmlFor="tf-cliente">Cliente</Label>
      <Input
        id="tf-cliente"
        className="h-10"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onDoubleClick={keyboard.open}
      />
    </div>
  );
}

function CampoValor({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const keyboard = useKeyboard();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className="h-10 text-right tabular-nums"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(dec(e.target.value))}
        onFocus={(e) => e.target.select()}
        onDoubleClick={keyboard.open}
      />
    </div>
  );
}

function Pie({ error, guardando, editando, onClose, onSave }: { error: string | null; guardando: boolean; editando: boolean; onClose: () => void; onSave: () => void }) {
  return (
    <>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="lg" onClick={onClose}>
          Cancelar
        </Button>
        <Button size="lg" onClick={onSave} disabled={guardando}>
          {guardando && <LoaderCircle className="size-4 animate-spin" />}
          {editando ? 'Actualizar' : 'Guardar'}
        </Button>
      </div>
    </>
  );
}

function TarifaSacrificioForm({
  tarifa,
  onClose,
  onSaved,
}: {
  tarifa: TarifaSacrificio | null;
  onClose: () => void;
  onSaved: (cliente: string, nueva: boolean) => void;
}) {
  const guardar = useGuardarTarifaSacrificio();
  const [cliente, setCliente] = useState(tarifa?.cliente ?? '');
  const [valor, setValor] = useState(tarifa ? String(tarifa.valorBase) : '');
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setError(null);
    if (!cliente.trim()) return setError('El cliente es obligatorio.');
    if (!valor.trim()) return setError('El valor base es obligatorio.');
    try {
      await guardar.mutateAsync({ id: tarifa?.id, input: { cliente: cliente.trim(), valorBase: Number(valor) } });
      onSaved(cliente.trim(), !tarifa);
    } catch (err) {
      setError(errorDe(err, 'No se pudo guardar la tarifa.'));
    }
  }

  return (
    <Dialog open onClose={onClose} title={tarifa ? 'Editar tarifa de sacrificio' : 'Nueva tarifa de sacrificio'} className="max-w-lg">
      <div className="space-y-4">
        <CampoCliente value={cliente} onChange={setCliente} />
        <CampoValor id="tf-valor" label="Valor base por res" value={valor} onChange={setValor} />
        <Pie error={error} guardando={guardar.isPending} editando={!!tarifa} onClose={onClose} onSave={enviar} />
      </div>
    </Dialog>
  );
}

function TarifaSubproductoForm({
  tarifa,
  onClose,
  onSaved,
}: {
  tarifa: TarifaSubproducto | null;
  onClose: () => void;
  onSaved: (cliente: string, nueva: boolean) => void;
}) {
  const guardar = useGuardarTarifaSubproducto();
  const [cliente, setCliente] = useState(tarifa?.cliente ?? '');
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(CONCEPTOS.map(([, , clave]) => [clave, tarifa ? String(tarifa[clave]) : '0'])),
  );
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setError(null);
    if (!cliente.trim()) return setError('El cliente es obligatorio.');
    const input = {
      cliente: cliente.trim(),
      ...Object.fromEntries(CONCEPTOS.map(([, , clave]) => [clave, Number(valores[clave] || 0)])),
    } as Omit<TarifaSubproducto, 'id'>;
    try {
      await guardar.mutateAsync({ id: tarifa?.id, input });
      onSaved(cliente.trim(), !tarifa);
    } catch (err) {
      setError(errorDe(err, 'No se pudo guardar la tarifa.'));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={tarifa ? 'Editar tarifa de subproductos' : 'Nueva tarifa de subproductos'}
      description="Valor unitario de cada subproducto retomado (deja en 0 los que no aplican). Pieles y sebo son por kg."
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <CampoCliente value={cliente} onChange={setCliente} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {CONCEPTOS.map(([q, , clave, titulo]) => (
            <CampoValor
              key={q}
              id={`tf-${clave}`}
              label={q === 'pielesKg' || q === 'seboKg' ? `${titulo} (por kg)` : titulo}
              value={valores[clave]}
              onChange={(v) => setValores((prev) => ({ ...prev, [clave]: v }))}
            />
          ))}
        </div>
        <Pie error={error} guardando={guardar.isPending} editando={!!tarifa} onClose={onClose} onSave={enviar} />
      </div>
    </Dialog>
  );
}
