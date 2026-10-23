import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Inbox,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { cn, plantToday } from '@/lib/utils';
import { decimal, fechaLarga, nombreTarifa, pesos } from './beneficio-api';
import {
  CONCEPTOS,
  totalesRetoma,
  useBorrarRetoma,
  useFirmadoresRetomas,
  useGuardarRetoma,
  useRetomas,
  useTarifasSubproductos,
  type FilaRetoma,
  type SaveFilaRetoma,
} from './retomas-api';
import { exportarRetomasExcel } from './retomas-export';

const mesActual = () => `${plantToday().slice(0, 7)}-01`;
const anioActual = () => `${plantToday().slice(0, 4)}-01-01`;

function errorDe(err: unknown, porDefecto: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
  return (Array.isArray(msg) ? msg.join(' ') : msg) || porDefecto;
}

const cant = (v: number | null, kg: boolean) => (v == null ? '' : kg ? decimal(v, v % 1 ? 1 : 0) : String(v));
const esKg = (q: string) => q === 'pielesKg' || q === 'seboKg';

export function RetomasHistoricoPage() {
  const [desde, setDesde] = useState(mesActual);
  const [hasta, setHasta] = useState(plantToday);
  const [buscar, setBuscar] = useState('');
  const [seleccion, setSeleccion] = useState<FilaRetoma | null>(null);
  const [form, setForm] = useState<{ fila: FilaRetoma | null } | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [exportando, setExportando] = useState(false);

  const datos = useRetomas(desde, hasta);
  const borrar = useBorrarRetoma();

  const filas = useMemo(() => {
    const q = buscar.trim().toUpperCase();
    const todas = datos.data ?? [];
    return q ? todas.filter((f) => f.firmador?.toUpperCase().includes(q)) : todas;
  }, [datos.data, buscar]);

  // Fila "Total": suma de reses, cantidades y totales.
  const totales = useMemo(() => {
    const cantidades = CONCEPTOS.map(() => 0);
    const montos = CONCEPTOS.map(() => 0);
    let reses = 0;
    let total = 0;
    for (const f of filas) {
      const t = totalesRetoma(f);
      reses += f.reses;
      CONCEPTOS.forEach(([q], k) => {
        cantidades[k] += f[q] ?? 0;
        montos[k] += t.porConcepto[k];
      });
      total += t.total;
    }
    return { reses, cantidades, montos, total };
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
    const nombre = `${seleccion.firmador ?? 'sin firmador'} del ${fechaLarga(seleccion.fecha)}`;
    if (!window.confirm(`¿Seguro que querés borrar la retoma de ${nombre}?`)) return;
    try {
      await borrar.mutateAsync(seleccion.id);
      setSeleccion(null);
      setAviso({ ok: true, texto: `Retoma de ${nombre} borrada.` });
    } catch (err) {
      setAviso({ ok: false, texto: errorDe(err, 'No se pudo borrar la retoma.') });
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      await exportarRetomasExcel(filas, `RETOMAS ${desde || 'inicio'} a ${hasta || 'hoy'}`);
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
  const tf = 'sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-border bg-muted px-2 py-2 text-right font-semibold tabular-nums';
  const columnas = 4 + CONCEPTOS.length * 3;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <RotateCcw className="size-9" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Retomas</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Histórico sacrificio — subproductos retomados por firmador.
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
            title="Editar retoma seleccionada"
            disabled={!seleccion}
            onClick={() => seleccion && setForm({ fila: seleccion })}
          >
            <Pencil />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-12 text-red-600 hover:bg-red-50 hover:text-red-700 [&_svg]:size-6"
            title="Borrar retoma seleccionada"
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
          <Label htmlFor="hr-desde">Desde</Label>
          <Input id="hr-desde" type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hr-hasta">Hasta</Label>
          <Input id="hr-hasta" type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
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
            placeholder="Buscar firmador…"
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
                <th className={cn(th, 'text-left')}>Fecha</th>
                <th className={cn(th, 'text-left')}>Firmador</th>
                <th className={cn(th, 'text-right')}>Reses</th>
                {CONCEPTOS.map(([q, , , t]) => (
                  <th key={q} className={cn(th, 'text-right')}>{t}</th>
                ))}
                {CONCEPTOS.map(([q, , , t]) => (
                  <th key={`v-${q}`} className={cn(th, 'text-right')}>Valor {t.toLowerCase()}</th>
                ))}
                {CONCEPTOS.map(([q, , , t]) => (
                  <th key={`t-${q}`} className={cn(th, 'text-right')}>Total {t.toLowerCase()}</th>
                ))}
                <th className={cn(th, 'text-right')}>Total</th>
              </tr>
            </thead>
            <tbody>
              {datos.isLoading ? (
                <tr>
                  <td colSpan={columnas} className="py-16 text-center text-muted-foreground">
                    <LoaderCircle className="mx-auto size-6 animate-spin" />
                  </td>
                </tr>
              ) : filas.length === 0 ? (
                <tr>
                  <td colSpan={columnas} className="py-16">
                    <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                      <Inbox className="size-8" />
                      <p className="text-sm font-medium">No hay retomas en este rango</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filas.map((f) => {
                  const t = totalesRetoma(f);
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
                      <td className={td}>{fechaLarga(f.fecha)}</td>
                      <td className={td}>{f.firmador ?? ''}</td>
                      <td className={cn(td, 'text-right font-semibold')}>{f.reses}</td>
                      {CONCEPTOS.map(([q]) => (
                        <td key={q} className={cn(td, 'text-right')}>{cant(f[q], esKg(q))}</td>
                      ))}
                      {CONCEPTOS.map(([q, v]) => (
                        <td key={`v-${q}`} className={cn(td, 'text-right text-muted-foreground')}>{f[v] ? pesos(f[v]) : '$ -'}</td>
                      ))}
                      {CONCEPTOS.map(([q], k) => (
                        <td key={`t-${q}`} className={cn(td, 'text-right')}>{t.porConcepto[k] ? pesos(t.porConcepto[k]) : '$ -'}</td>
                      ))}
                      <td className={cn(td, 'text-right font-semibold')}>{pesos(t.total)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr>
                  <td className={cn(tf, 'text-left')} colSpan={2}>Total</td>
                  <td className={tf}>{totales.reses.toLocaleString('es-CO')}</td>
                  {CONCEPTOS.map(([q], k) => (
                    <td key={q} className={tf}>{decimal(totales.cantidades[k], 0)}</td>
                  ))}
                  {CONCEPTOS.map(([q]) => (
                    <td key={`v-${q}`} className={tf} />
                  ))}
                  {CONCEPTOS.map(([q], k) => (
                    <td key={`t-${q}`} className={tf}>{pesos(totales.montos[k])}</td>
                  ))}
                  <td className={tf}>{pesos(totales.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {form && (
        <RetomaForm
          fila={form.fila}
          onClose={() => setForm(null)}
          onSaved={(f, nuevo) => {
            setForm(null);
            setSeleccion(f);
            setAviso({ ok: true, texto: `Retoma de ${f.firmador ?? ''} ${nuevo ? 'agregada' : 'actualizada'}.` });
          }}
        />
      )}
    </div>
  );
}

type Campos = Record<Exclude<keyof SaveFilaRetoma, never>, string>;

function aCampos(f: FilaRetoma | null): Campos {
  const s = (v: string | number | null | undefined) => (v == null ? '' : String(v));
  return {
    fecha: f?.fecha ?? plantToday(),
    firmador: s(f?.firmador),
    reses: s(f?.reses),
    cabezas: s(f?.cabezas),
    despojos: s(f?.despojos),
    libros: s(f?.libros),
    pielesKg: s(f?.pielesKg),
    viscerasRojas: s(f?.viscerasRojas),
    seboKg: s(f?.seboKg),
    valorCabezas: s(f?.valorCabezas ?? 0),
    valorDespojos: s(f?.valorDespojos ?? 0),
    valorLibros: s(f?.valorLibros ?? 0),
    valorPieles: s(f?.valorPieles ?? 0),
    valorViscerasRojas: s(f?.valorViscerasRojas ?? 0),
    valorSebo: s(f?.valorSebo ?? 0),
  };
}

function RetomaForm({
  fila,
  onClose,
  onSaved,
}: {
  fila: FilaRetoma | null;
  onClose: () => void;
  onSaved: (f: FilaRetoma, nuevo: boolean) => void;
}) {
  const keyboard = useKeyboard();
  const firmadores = useFirmadoresRetomas();
  const tarifas = useTarifasSubproductos();
  const guardar = useGuardarRetoma();
  const [c, setC] = useState<Campos>(() => aCampos(fila));
  // El sebo se calcula solo (reses × 7) hasta que se escriba a mano.
  const [seboAuto, setSeboAuto] = useState(!fila);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof Campos, v: string) => setC((prev) => ({ ...prev, [k]: v }));
  const entero = (v: string) => v.replace(/[^\d]/g, '');
  const dec = (v: string) => v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const tarifa = useMemo(() => {
    const nombre = nombreTarifa(c.firmador);
    return nombre ? tarifas.data?.find((t) => nombreTarifa(t.cliente) === nombre) ?? null : null;
  }, [c.firmador, tarifas.data]);

  // Al reconocer el firmador se traen sus valores de la tabla de tarifas (como
  // los BUSCARX de la hoja). Al editar no se tocan los valores guardados
  // mientras el firmador siga siendo el mismo.
  useEffect(() => {
    if (!tarifa) return;
    if (fila && nombreTarifa(fila.firmador ?? '') === nombreTarifa(c.firmador)) return;
    setC((prev) => ({
      ...prev,
      ...Object.fromEntries(CONCEPTOS.map(([, val, clave]) => [val, String(tarifa[clave])])),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarifa?.id]);

  function elegirFirmador(v: string) {
    set('firmador', v);
  }

  function cambiarReses(v: string) {
    const r = entero(v);
    setC((prev) => ({ ...prev, reses: r, ...(seboAuto && { seboKg: r ? String(Number(r) * 7) : '' }) }));
  }

  const fila_: FilaRetoma = {
    id: '',
    fecha: c.fecha,
    firmador: c.firmador,
    reses: num(c.reses) ?? 0,
    cabezas: num(c.cabezas),
    despojos: num(c.despojos),
    libros: num(c.libros),
    pielesKg: num(c.pielesKg),
    viscerasRojas: num(c.viscerasRojas),
    seboKg: num(c.seboKg),
    valorCabezas: num(c.valorCabezas) ?? 0,
    valorDespojos: num(c.valorDespojos) ?? 0,
    valorLibros: num(c.valorLibros) ?? 0,
    valorPieles: num(c.valorPieles) ?? 0,
    valorViscerasRojas: num(c.valorViscerasRojas) ?? 0,
    valorSebo: num(c.valorSebo) ?? 0,
  };
  const t = totalesRetoma(fila_);

  // Llena con las reses los conceptos que tienen tarifa para el firmador.
  function llenarConReses() {
    if (!tarifa || !c.reses) return;
    setC((prev) => ({
      ...prev,
      ...(tarifa.cabezas > 0 && { cabezas: prev.reses }),
      ...(tarifa.despojos > 0 && { despojos: prev.reses }),
      ...(tarifa.libros > 0 && { libros: prev.reses }),
      ...(tarifa.viscerasRojas > 0 && { viscerasRojas: prev.reses }),
    }));
  }

  async function enviar() {
    setError(null);
    if (!c.fecha) return setError('La fecha es obligatoria.');
    if (!c.firmador.trim()) return setError('El firmador es obligatorio.');
    const { id: _id, ...resto } = fila_;
    const input = { ...resto, firmador: c.firmador.trim() } as SaveFilaRetoma;
    // El API no acepta null en los opcionales: se omiten.
    const limpio = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== null)) as SaveFilaRetoma;
    try {
      const f = await guardar.mutateAsync({ id: fila?.id, input: limpio });
      onSaved(f, !fila);
    } catch (err) {
      setError(errorDe(err, 'No se pudo guardar la retoma.'));
    }
  }

  const campo = (k: keyof Campos, label: string, filtro: (v: string) => string, onChange?: (v: string) => void) => (
    <div className="space-y-1">
      <Label htmlFor={`hrf-${k}`}>{label}</Label>
      <Input
        id={`hrf-${k}`}
        className="h-9 text-right tabular-nums"
        inputMode="decimal"
        value={c[k]}
        onChange={(e) => (onChange ? onChange(e.target.value) : set(k, filtro(e.target.value)))}
        onFocus={(e) => e.target.select()}
        onDoubleClick={keyboard.open}
      />
    </div>
  );

  const lista = [...new Set([...(firmadores.data ?? []), ...(tarifas.data ?? []).map((x) => x.cliente)])].sort();

  return (
    <Dialog
      open
      onClose={onClose}
      title={fila ? 'Editar retoma' : 'Nueva retoma'}
      description="Los valores salen de la tarifa del firmador (se pueden cambiar); los totales se calculan solos."
      className="max-w-5xl"
      scrollInterno
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[160px_1fr_120px]">
          <div className="space-y-1">
            <Label htmlFor="hrf-fecha">Fecha</Label>
            <Input id="hrf-fecha" type="date" className="h-9" value={c.fecha} onChange={(e) => set('fecha', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hrf-firmador">Firmador</Label>
            <Input
              id="hrf-firmador"
              className="h-9"
              list="hrl-firmador"
              autoComplete="off"
              value={c.firmador}
              onChange={(e) => elegirFirmador(e.target.value.toUpperCase())}
              onDoubleClick={keyboard.open}
            />
            <datalist id="hrl-firmador">
              {lista.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </div>
          {campo('reses', 'Reses', entero, cambiarReses)}
        </div>
        {c.firmador.trim() && tarifas.data && !tarifa && (
          <p className="text-sm text-amber-700">
            El firmador no está en la tabla de tarifas de subproductos: escribe los valores a mano.
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Concepto</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Valor unitario</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {CONCEPTOS.map(([q, v, , titulo], k) => (
                <tr key={q} className="border-t border-border">
                  <td className="px-3 py-1.5 font-medium">
                    {titulo}
                    {esKg(q) && <span className="ml-1 text-xs text-muted-foreground">(kg)</span>}
                  </td>
                  <td className="w-40 px-3 py-1.5">
                    <Input
                      aria-label={`Cantidad ${titulo}`}
                      id={`hrf-${q}`}
                      className="h-9 text-right tabular-nums"
                      inputMode="decimal"
                      value={c[q]}
                      onChange={(e) => {
                        if (q === 'seboKg') setSeboAuto(false);
                        set(q, esKg(q) ? dec(e.target.value) : entero(e.target.value));
                      }}
                      onFocus={(e) => e.target.select()}
                      onDoubleClick={keyboard.open}
                    />
                  </td>
                  <td className="w-44 px-3 py-1.5">
                    <Input
                      aria-label={`Valor ${titulo}`}
                      id={`hrf-${v}`}
                      className="h-9 text-right tabular-nums"
                      inputMode="decimal"
                      value={c[v]}
                      onChange={(e) => set(v, dec(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      onDoubleClick={keyboard.open}
                    />
                  </td>
                  <td className="w-40 px-3 py-1.5 text-right tabular-nums">{pesos(t.porConcepto[k])}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="px-3 py-2" colSpan={3}>
                  Total
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{pesos(t.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            onClick={llenarConReses}
            disabled={!tarifa || !c.reses}
            title="Pone la cantidad de reses en los conceptos que tienen tarifa para este firmador"
          >
            Llenar con las reses
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="lg" onClick={enviar} disabled={guardar.isPending}>
              {guardar.isPending && <LoaderCircle className="size-4 animate-spin" />}
              {fila ? 'Actualizar' : 'Guardar'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
