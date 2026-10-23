import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  History,
  Inbox,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { cn, plantToday } from '@/lib/utils';
import {
  calcular,
  decimal,
  fechaLarga,
  nombreTarifa,
  pesos,
  semanaDe,
  totalReses,
  useBeneficio,
  useBorrarBeneficio,
  useGuardarBeneficio,
  useOpcionesBeneficio,
  useTarifasSacrificio,
  type FilaBeneficio,
  type SaveFilaBeneficio,
} from './beneficio-api';
import { exportarBeneficioExcel } from './beneficio-export';

const mesActual = () => `${plantToday().slice(0, 7)}-01`;
const anioActual = () => `${plantToday().slice(0, 4)}-01-01`;

function errorDe(err: unknown, porDefecto: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
  return (Array.isArray(msg) ? msg.join(' ') : msg) || porDefecto;
}

// Columnas de la hoja: [título, clase de la celda].
const COLUMNAS: [string, string][] = [
  ['No semana', 'text-center'],
  ['Fecha', ''],
  ['Proveedor', ''],
  ['Firmador', ''],
  ['Cliente', ''],
  ['Granja', ''],
  ['Municipio', ''],
  ['No de guía ICA', ''],
  ['Lote', 'text-right'],
  ['Novillo', 'text-right'],
  ['Novilla', 'text-right'],
  ['Vaca', 'text-right'],
  ['Toro', 'text-right'],
  ['Búfalo', 'text-right'],
  ['Total reses', 'text-right'],
  ['Pieles', 'text-right'],
  ['Peso pie', 'text-right'],
  ['Peso caliente', 'text-right'],
  ['Promedio peso caliente', 'text-right'],
  ['Rendimiento', 'text-right'],
  ['Tarifa de sacrificio', 'text-right'],
  ['Total sacrificio', 'text-right'],
];

export function BeneficioHistoricoPage() {
  const [desde, setDesde] = useState(mesActual);
  const [hasta, setHasta] = useState(plantToday);
  const [buscar, setBuscar] = useState('');
  const [seleccion, setSeleccion] = useState<FilaBeneficio | null>(null);
  const [form, setForm] = useState<{ fila: FilaBeneficio | null } | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [exportando, setExportando] = useState(false);

  const datos = useBeneficio(desde, hasta);
  const borrar = useBorrarBeneficio();

  const filas = useMemo(() => {
    const q = buscar.trim().toUpperCase();
    const todas = datos.data ?? [];
    if (!q) return todas;
    return todas.filter((f) =>
      [f.proveedor, f.firmador, f.cliente, f.granja, f.municipio, f.guiaIca, f.lote?.toString()]
        .some((v) => v?.toUpperCase().includes(q)),
    );
  }, [datos.data, buscar]);

  // Fila "Total" de la hoja: sumas (SUBTOTAL 109) y promedio de promedios (SUBTOTAL 101).
  const totales = useMemo(() => {
    const t = { novillo: 0, novilla: 0, vaca: 0, toro: 0, bufalo: 0, reses: 0, pieles: 0, pie: 0, caliente: 0, promedios: 0, sacrificio: 0 };
    for (const f of filas) {
      const c = calcular(f);
      t.novillo += f.novillo;
      t.novilla += f.novilla;
      t.vaca += f.vaca;
      t.toro += f.toro;
      t.bufalo += f.bufalo;
      t.reses += c.reses;
      t.pieles += f.pieles ?? 0;
      t.pie += f.pesoPieKg ?? 0;
      t.caliente += f.pesoCalienteKg ?? 0;
      t.promedios += c.promedio;
      t.sacrificio += c.totalSacrificio;
    }
    return { ...t, promedio: filas.length ? t.promedios / filas.length : 0 };
  }, [filas]);

  useEffect(() => {
    if (seleccion && !filas.some((f) => f.id === seleccion.id)) setSeleccion(null);
  }, [filas, seleccion]);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 4000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  async function borrarSeleccion() {
    if (!seleccion) return;
    const nombre = `lote ${seleccion.lote ?? '—'} (${seleccion.cliente ?? 'sin cliente'})`;
    if (!window.confirm(`¿Seguro que querés borrar el registro del ${nombre}?`)) return;
    try {
      await borrar.mutateAsync(seleccion.id);
      setSeleccion(null);
      setAviso({ ok: true, texto: `Registro del ${nombre} borrado.` });
    } catch (err) {
      setAviso({ ok: false, texto: errorDe(err, 'No se pudo borrar el registro.') });
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      await exportarBeneficioExcel(filas, `BENEFICIO ${desde || 'inicio'} a ${hasta || 'hoy'}`);
    } finally {
      setExportando(false);
    }
  }

  const presets: [string, () => void][] = [
    ['Hoy', () => { setDesde(plantToday()); setHasta(plantToday()); }],
    ['Este mes', () => { setDesde(mesActual()); setHasta(plantToday()); }],
    ['Este año', () => { setDesde(anioActual()); setHasta(plantToday()); }],
    ['Todo', () => { setDesde(''); setHasta(''); }],
  ];

  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
  const td = 'whitespace-nowrap px-2 py-1.5 tabular-nums';
  const tf = 'sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-border bg-muted px-2 py-2 font-semibold tabular-nums';

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <History className="size-9" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Beneficio</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Histórico sacrificio — una fila por guía beneficiada.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="lg" className="h-12 px-6 text-base" onClick={() => setForm({ fila: null })}>
            <Plus className="size-5" />
            Nuevo
          </Button>
          <span className="mx-1 h-10 w-px bg-border" />
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-6"
            title="Editar registro seleccionado"
            disabled={!seleccion}
            onClick={() => seleccion && setForm({ fila: seleccion })}
          >
            <Pencil />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-12 text-red-600 hover:bg-red-50 hover:text-red-700 [&_svg]:size-6"
            title="Borrar registro seleccionado"
            disabled={!seleccion || borrar.isPending}
            onClick={borrarSeleccion}
          >
            {borrar.isPending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-6"
            title="Exportar a Excel lo que se ve en la tabla"
            disabled={!filas.length || exportando}
            onClick={exportar}
          >
            {exportando ? <LoaderCircle className="animate-spin" /> : <Download />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-12 [&_svg]:size-6"
            title="Refrescar"
            disabled={datos.isFetching}
            onClick={() => datos.refetch()}
          >
            <RefreshCw className={cn(datos.isFetching && 'animate-spin')} />
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

      <Card className="flex shrink-0 flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <Label htmlFor="hb-desde">Desde</Label>
          <Input id="hb-desde" type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hb-hasta">Hasta</Label>
          <Input id="hb-hasta" type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {presets.map(([label, fn]) => (
            <Button key={label} variant="outline" size="sm" className="h-9" onClick={fn}>
              {label}
            </Button>
          ))}
        </div>
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder="Buscar proveedor, firmador, cliente, granja, municipio, guía o lote…"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filas.length.toLocaleString('es-CO')} registros · {totales.reses.toLocaleString('es-CO')} reses
        </p>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="scrollbar-app min-h-0 flex-1 overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {COLUMNAS.map(([t, cls]) => (
                  <th key={t} className={cn(th, cls || 'text-left')}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.isLoading ? (
                <tr>
                  <td colSpan={COLUMNAS.length} className="py-16 text-center text-muted-foreground">
                    <LoaderCircle className="mx-auto size-6 animate-spin" />
                  </td>
                </tr>
              ) : filas.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNAS.length} className="py-16">
                    <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                      <Inbox className="size-8" />
                      <p className="text-sm font-medium">No hay registros en este rango</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filas.map((f) => {
                  const c = calcular(f);
                  const sel = seleccion?.id === f.id;
                  return (
                    <tr
                      key={f.id}
                      onClick={() => setSeleccion(sel ? null : f)}
                      onDoubleClick={() => setForm({ fila: f })}
                      className={cn(
                        'cursor-pointer [&>td]:border-b [&>td]:border-border',
                        sel ? 'bg-sky-100' : 'hover:bg-muted/40',
                      )}
                    >
                      <td className={cn(td, 'text-center')}>{c.semana}</td>
                      <td className={td}>{fechaLarga(f.fecha)}</td>
                      <td className={td}>{f.proveedor ?? ''}</td>
                      <td className={td}>{f.firmador ?? ''}</td>
                      <td className={td}>{f.cliente ?? ''}</td>
                      <td className={td}>{f.granja ?? ''}</td>
                      <td className={td}>{f.municipio ?? ''}</td>
                      <td className={td}>{f.guiaIca ?? ''}</td>
                      <td
                        className={cn(td, 'text-right', f.ordenBeneficioId && 'font-semibold text-emerald-700')}
                        title={f.ordenBeneficioId ? `Generada sola al terminar la OB${f.lote ?? ''} en Canal Caliente` : undefined}
                      >
                        {f.lote ?? ''}
                      </td>
                      <td className={cn(td, 'text-right')}>{f.novillo}</td>
                      <td className={cn(td, 'text-right')}>{f.novilla}</td>
                      <td className={cn(td, 'text-right')}>{f.vaca}</td>
                      <td className={cn(td, 'text-right')}>{f.toro}</td>
                      <td className={cn(td, 'text-right')}>{f.bufalo}</td>
                      <td className={cn(td, 'text-right font-semibold')}>{c.reses}</td>
                      <td className={cn(td, 'text-right')}>{f.pieles ?? ''}</td>
                      <td className={cn(td, 'text-right')}>{f.pesoPieKg != null ? decimal(f.pesoPieKg, 1) : ''}</td>
                      <td className={cn(td, 'text-right')}>{f.pesoCalienteKg != null ? decimal(f.pesoCalienteKg, 1) : ''}</td>
                      <td className={cn(td, 'text-right')}>{decimal(c.promedio, 1)}</td>
                      <td className={cn(td, 'text-right')}>{decimal(c.rendimiento, 2)}</td>
                      <td className={cn(td, 'text-right')}>{pesos(c.tarifa)}</td>
                      <td className={cn(td, 'text-right')}>{pesos(c.totalSacrificio)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr>
                  <td className={tf} />
                  <td className={tf}>Total</td>
                  <td className={tf} colSpan={7} />
                  <td className={cn(tf, 'text-right')}>{totales.novillo.toLocaleString('es-CO')}</td>
                  <td className={cn(tf, 'text-right')}>{totales.novilla.toLocaleString('es-CO')}</td>
                  <td className={cn(tf, 'text-right')}>{totales.vaca.toLocaleString('es-CO')}</td>
                  <td className={cn(tf, 'text-right')}>{totales.toro.toLocaleString('es-CO')}</td>
                  <td className={cn(tf, 'text-right')}>{totales.bufalo.toLocaleString('es-CO')}</td>
                  <td className={cn(tf, 'text-right')}>{totales.reses.toLocaleString('es-CO')}</td>
                  <td className={cn(tf, 'text-right')}>{totales.pieles.toLocaleString('es-CO')}</td>
                  <td className={cn(tf, 'text-right')}>{decimal(totales.pie, 1)}</td>
                  <td className={cn(tf, 'text-right')}>{decimal(totales.caliente, 1)}</td>
                  <td className={cn(tf, 'text-right')}>{decimal(totales.promedio, 1)}</td>
                  <td className={tf} />
                  <td className={tf} />
                  <td className={cn(tf, 'text-right')}>{pesos(totales.sacrificio)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {form && (
        <BeneficioForm
          fila={form.fila}
          onClose={() => setForm(null)}
          onSaved={(f, nuevo) => {
            setForm(null);
            setSeleccion(f);
            setAviso({ ok: true, texto: `Registro del lote ${f.lote ?? '—'} ${nuevo ? 'agregado' : 'actualizado'}.` });
          }}
        />
      )}
    </div>
  );
}

type Campos = Record<keyof SaveFilaBeneficio, string>;

function aCampos(f: FilaBeneficio | null, lote?: number): Campos {
  const s = (v: string | number | null | undefined) => (v == null ? '' : String(v));
  return {
    fecha: f?.fecha ?? plantToday(),
    proveedor: s(f?.proveedor),
    firmador: s(f?.firmador),
    cliente: s(f?.cliente),
    granja: s(f?.granja),
    municipio: s(f?.municipio),
    guiaIca: s(f?.guiaIca),
    lote: s(f ? f.lote : lote),
    novillo: s(f?.novillo ?? 0),
    novilla: s(f?.novilla ?? 0),
    vaca: s(f?.vaca ?? 0),
    toro: s(f?.toro ?? 0),
    bufalo: s(f?.bufalo ?? 0),
    pieles: s(f?.pieles),
    pesoPieKg: s(f?.pesoPieKg),
    pesoCalienteKg: s(f?.pesoCalienteKg),
  };
}

function BeneficioForm({
  fila,
  onClose,
  onSaved,
}: {
  fila: FilaBeneficio | null;
  onClose: () => void;
  onSaved: (f: FilaBeneficio, nuevo: boolean) => void;
}) {
  const keyboard = useKeyboard();
  const opciones = useOpcionesBeneficio();
  const tarifas = useTarifasSacrificio();
  const guardar = useGuardarBeneficio();
  const [c, setC] = useState<Campos>(() => aCampos(fila));
  const [error, setError] = useState<string | null>(null);

  // Lote sugerido para un registro nuevo: el siguiente al último.
  useEffect(() => {
    if (!fila && opciones.data && !c.lote) {
      setC((prev) => ({ ...prev, lote: String(opciones.data.siguienteLote) }));
    }
  }, [fila, opciones.data, c.lote]);

  const set = (k: keyof Campos, v: string) => setC((prev) => ({ ...prev, [k]: v }));
  const entero = (v: string) => v.replace(/[^\d]/g, '');
  const dec = (v: string) => v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

  const reses = totalReses({
    novillo: num(c.novillo) ?? 0,
    novilla: num(c.novilla) ?? 0,
    vaca: num(c.vaca) ?? 0,
    toro: num(c.toro) ?? 0,
    bufalo: num(c.bufalo) ?? 0,
  });
  const pie = num(c.pesoPieKg) ?? 0;
  const caliente = num(c.pesoCalienteKg) ?? 0;
  const firmador = nombreTarifa(c.firmador);
  const tarifa = tarifas.data?.find((t) => nombreTarifa(t.cliente) === firmador)?.valorBase ?? 0;

  async function enviar() {
    setError(null);
    if (!c.fecha) return setError('La fecha es obligatoria.');
    if (!c.firmador.trim()) return setError('El firmador es obligatorio (de él sale la tarifa).');
    if (reses <= 0) return setError('Registra al menos una res (novillo, novilla, vaca, toro o búfalo).');
    const input: SaveFilaBeneficio = {
      fecha: c.fecha,
      proveedor: c.proveedor.trim() || null,
      firmador: c.firmador.trim() || null,
      cliente: c.cliente.trim() || c.firmador.trim() || null,
      granja: c.granja.trim() || null,
      municipio: c.municipio.trim() || null,
      guiaIca: c.guiaIca.trim() || null,
      lote: num(c.lote) ?? null,
      novillo: num(c.novillo) ?? 0,
      novilla: num(c.novilla) ?? 0,
      vaca: num(c.vaca) ?? 0,
      toro: num(c.toro) ?? 0,
      bufalo: num(c.bufalo) ?? 0,
      pieles: num(c.pieles) ?? null,
      pesoPieKg: num(c.pesoPieKg) ?? null,
      pesoCalienteKg: num(c.pesoCalienteKg) ?? null,
    };
    // El API no acepta null en los opcionales: se omiten.
    const limpio = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== null)) as SaveFilaBeneficio;
    try {
      const f = await guardar.mutateAsync({ id: fila?.id, input: limpio });
      onSaved(f, !fila);
    } catch (err) {
      setError(errorDe(err, 'No se pudo guardar el registro.'));
    }
  }

  const texto = (k: keyof Campos, label: string, lista?: string[], extra?: string) => (
    <div className={cn('space-y-1', extra)}>
      <Label htmlFor={`hbf-${k}`}>{label}</Label>
      <Input
        id={`hbf-${k}`}
        className="h-9"
        list={lista ? `hbl-${k}` : undefined}
        autoComplete="off"
        value={c[k]}
        onChange={(e) => set(k, e.target.value.toUpperCase())}
        onDoubleClick={keyboard.open}
      />
      {lista && (
        <datalist id={`hbl-${k}`}>
          {lista.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </div>
  );

  const numero = (k: keyof Campos, label: string, filtro: (v: string) => string) => (
    <div className="space-y-1">
      <Label htmlFor={`hbf-${k}`}>{label}</Label>
      <Input
        id={`hbf-${k}`}
        className="h-9 text-right tabular-nums"
        inputMode="decimal"
        value={c[k]}
        onChange={(e) => set(k, filtro(e.target.value))}
        onFocus={(e) => e.target.select()}
        onDoubleClick={keyboard.open}
      />
    </div>
  );

  const calc = (label: string, valor: string) => (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums">{valor}</p>
    </div>
  );

  const o = opciones.data;
  return (
    <Dialog
      open
      onClose={onClose}
      title={fila ? `Editar registro — lote ${fila.lote ?? '—'}` : 'Nuevo registro de beneficio'}
      description="Las columnas calculadas (semana, total reses, promedio, rendimiento, tarifa y total) se llenan solas."
      className="max-w-5xl"
      scrollInterno
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="hbf-fecha">Fecha</Label>
            <Input id="hbf-fecha" type="date" className="h-9" value={c.fecha} onChange={(e) => set('fecha', e.target.value)} />
          </div>
          {texto('guiaIca', 'No de guía ICA')}
          {numero('lote', 'Lote', entero)}
          {calc('No semana', c.fecha ? String(semanaDe(c.fecha)) : '—')}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {texto('proveedor', 'Proveedor', o?.proveedor)}
          {texto('firmador', 'Firmador', o?.firmador)}
          {texto('cliente', 'Cliente (si se deja vacío, queda el firmador)', o?.cliente)}
          {texto('granja', 'Granja', o?.granja)}
          {texto('municipio', 'Municipio', o?.municipio)}
        </div>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {numero('novillo', 'Novillo', entero)}
          {numero('novilla', 'Novilla', entero)}
          {numero('vaca', 'Vaca', entero)}
          {numero('toro', 'Toro', entero)}
          {numero('bufalo', 'Búfalo', entero)}
          {calc('Total reses', String(reses))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {numero('pieles', 'Pieles', entero)}
          {numero('pesoPieKg', 'Peso pie', dec)}
          {numero('pesoCalienteKg', 'Peso caliente', dec)}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {calc('Promedio peso caliente', decimal(reses ? caliente / reses : 0, 1))}
          {calc('Rendimiento', decimal(pie ? (caliente * 100) / pie : 0, 2))}
          {calc('Tarifa de sacrificio', pesos(tarifa))}
          {calc('Total sacrificio', pesos(reses * tarifa))}
        </div>
        {firmador && !tarifa && tarifas.data && (
          <p className="text-sm text-amber-700">
            El firmador no está en la tabla de tarifas: la tarifa queda en $ 0 (igual que en la hoja).
          </p>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="lg" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="lg" onClick={enviar} disabled={guardar.isPending}>
            {guardar.isPending && <LoaderCircle className="size-4 animate-spin" />}
            {fila ? 'Actualizar' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
