import { useEffect, useMemo, useState } from 'react';
import { History, Pencil, Plus, Power, Save, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { cn, plantToday } from '@/lib/utils';
import { useClientesAdmin } from '../clientes/api';
import {
  BASE_LABEL,
  CATEGORIA_LABEL,
  CATEGORIAS,
  mensajeError,
  pesosDec,
  useCambiarActivoTarifa,
  useCrearTarifa,
  useGuardarReglas,
  useHistorialTarifa,
  useReglasCorte,
  useTarifas,
  type CategoriaTarifa,
  type ReglaCorte,
  type Tarifa,
  type TarifaBase,
} from './maestros-api';
import { Encabezado, etiquetaDia, SinDatos } from './ui';

const TABS = [
  { value: 'tarifas', label: 'Tarifas de proceso' },
  { value: 'reglas', label: 'Reglas por corte' },
];

export function TarifasPage() {
  const clientes = useClientesAdmin();
  const [clienteId, setClienteId] = useState('');
  const [tab, setTab] = useState('tarifas');
  const tarifas = useTarifas(clienteId);
  const clienteNombre = clientes.data?.find((c) => c.id === clienteId)?.concepto ?? null;

  return (
    <div className="scrollbar-app flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <Encabezado
        titulo="Tarifas de proceso"
        descripcion="Valores que se cobran por desposte, inyección, porcionado y empaque. Cada cambio guarda una nueva versión con su fecha: el historial no se pierde."
        cargando={tarifas.isFetching}
        onRefrescar={() => tarifas.refetch()}
      />
      <Card className="flex shrink-0 flex-wrap items-end gap-3 p-4">
        <div className="min-w-80 flex-1 space-y-1">
          <Label htmlFor="tf-cliente">Aplicar a</Label>
          <Combobox
            id="tf-cliente"
            options={(clientes.data ?? []).filter((c) => c.active).map((c) => ({ value: c.id, label: c.concepto }))}
            value={clienteId}
            onChange={setClienteId}
            placeholder="Tarifas generales — escribe para ver las de un cliente"
          />
        </div>
        <p className="max-w-xl pb-1 text-xs text-muted-foreground">
          {clienteNombre
            ? `Se muestran las tarifas de ${clienteNombre}. Las que no tiene propias se toman de las generales; al editarlas se crea una tarifa propia para este cliente.`
            : 'Las tarifas generales se aplican a todos los clientes que no tengan una tarifa propia para el mismo concepto.'}
        </p>
      </Card>
      <Tabs tabs={TABS} value={tab} onChange={setTab} className="shrink-0" />
      {tab === 'tarifas' ? (
        <TablaTarifas tarifas={tarifas.data ?? []} clienteId={clienteId} clienteNombre={clienteNombre} />
      ) : (
        <ReglasCorte clienteId={clienteId} clienteNombre={clienteNombre} />
      )}
    </div>
  );
}

function TablaTarifas({ tarifas, clienteId, clienteNombre }: { tarifas: Tarifa[]; clienteId: string; clienteNombre: string | null }) {
  const [editar, setEditar] = useState<Tarifa | 'nueva' | null>(null);
  const [historial, setHistorial] = useState<Tarifa | null>(null);
  const activo = useCambiarActivoTarifa();
  const grupos = useMemo(() => {
    const m = new Map<CategoriaTarifa, Tarifa[]>();
    for (const t of tarifas) m.set(t.categoria, [...(m.get(t.categoria) ?? []), t]);
    return CATEGORIAS.filter((c) => m.has(c)).map((c) => [c, m.get(c)!] as const);
  }, [tarifas]);
  const th = 'px-3 py-2 text-xs font-semibold uppercase text-muted-foreground';

  return (
    <div className="flex shrink-0 flex-col gap-3 pb-2">
      <div className="flex justify-end">
        <Button onClick={() => setEditar('nueva')}>
          <Plus /> Nuevo concepto
        </Button>
      </div>
      {!grupos.length && <Card className="p-6"><SinDatos texto="Sin tarifas registradas" /></Card>}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {grupos.map(([cat, filas]) => (
          <Card key={cat} className="overflow-hidden">
            <h2 className="border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-bold uppercase tracking-wide">{CATEGORIA_LABEL[cat]}</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cn(th, 'text-left')}>Concepto</th>
                  <th className={cn(th, 'text-left')}>Base</th>
                  <th className={cn(th, 'text-right')}>Valor</th>
                  <th className={cn(th, 'text-left')}>Desde</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {filas.map((t) => (
                  <tr key={t.concepto} className={cn('border-t border-border', !t.activo && 'text-muted-foreground line-through')}>
                    <td className="px-3 py-2 font-medium">
                      {t.concepto}
                      {clienteId && (
                        <Badge tone={t.origen === 'cliente' ? 'info' : 'neutral'} className="ml-2 no-underline">
                          {t.origen === 'cliente' ? 'Propia' : 'General'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{BASE_LABEL[t.base]}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{pesosDec(t.valor)}</td>
                    <td className="px-3 py-2 text-xs tabular-nums">{etiquetaDia(t.vigenteDesde)}/{t.vigenteDesde.slice(0, 4)}</td>
                    <td className="px-2 py-1 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="icon" className="size-8" title="Cambiar valor" onClick={() => setEditar(t)}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8" title="Historial" onClick={() => setHistorial(t)}>
                          <History />
                        </Button>
                        {(!clienteId || t.origen === 'cliente') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title={t.activo ? 'Dejar de cobrar' : 'Volver a cobrar'}
                            onClick={() => activo.mutate({ concepto: t.concepto, clienteId: clienteId || undefined })}
                          >
                            <Power className={t.activo ? 'text-emerald-700' : 'text-muted-foreground'} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
      {editar && <TarifaDialog tarifa={editar === 'nueva' ? null : editar} clienteId={clienteId} clienteNombre={clienteNombre} onClose={() => setEditar(null)} />}
      {historial && <HistorialDialog tarifa={historial} clienteId={historial.origen === 'cliente' ? clienteId : ''} onClose={() => setHistorial(null)} />}
    </div>
  );
}

function TarifaDialog({ tarifa, clienteId, clienteNombre, onClose }: { tarifa: Tarifa | null; clienteId: string; clienteNombre: string | null; onClose: () => void }) {
  const crear = useCrearTarifa();
  const [categoria, setCategoria] = useState<CategoriaTarifa>(tarifa?.categoria ?? 'servicio');
  const [concepto, setConcepto] = useState(tarifa?.concepto ?? '');
  const [base, setBase] = useState<TarifaBase>(tarifa?.base ?? 'unidad');
  const [valor, setValor] = useState(tarifa ? String(tarifa.valor) : '');
  const [vigenteDesde, setVigenteDesde] = useState(plantToday);
  const [error, setError] = useState('');

  async function guardar() {
    setError('');
    try {
      await crear.mutateAsync({
        clienteId: clienteId || undefined,
        categoria,
        concepto: concepto.trim(),
        base,
        valor: Number(valor.replace(',', '.')),
        vigenteDesde,
      });
      onClose();
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar la tarifa.'));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={tarifa ? `Cambiar ${tarifa.concepto}` : 'Nuevo concepto'}
      description={`${clienteNombre ? `Tarifa propia de ${clienteNombre}` : 'Tarifa general'}. El valor anterior queda en el historial.`}
    >
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="tf-cat">Categoría</Label>
            <Select id="tf-cat" value={categoria} disabled={!!tarifa} onChange={(e) => setCategoria(e.target.value as CategoriaTarifa)}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_LABEL[c]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tf-base">Se cobra</Label>
            <Select id="tf-base" value={base} onChange={(e) => setBase(e.target.value as TarifaBase)}>
              {Object.entries(BASE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tf-concepto">Concepto</Label>
          <Input id="tf-concepto" value={concepto} disabled={!!tarifa} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej. TERMOFORMADO 2X2" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="tf-valor">Valor ($)</Label>
            <Input id="tf-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tf-desde">Vigente desde</Label>
            <Input id="tf-desde" type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={concepto.trim().length < 2 || valor === '' || !vigenteDesde || crear.isPending}>
            <Save /> Guardar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function HistorialDialog({ tarifa, clienteId, onClose }: { tarifa: Tarifa; clienteId: string; onClose: () => void }) {
  const q = useHistorialTarifa(tarifa.concepto, clienteId);
  return (
    <Dialog open onClose={onClose} title={`Historial · ${tarifa.concepto}`} description={clienteId ? 'Tarifa propia del cliente' : 'Tarifa general'}>
      <div className="p-6">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs uppercase text-muted-foreground">
              <th className="px-2 py-1 text-left">Vigente desde</th>
              <th className="px-2 py-1 text-right">Valor</th>
              <th className="px-2 py-1 text-left">Base</th>
              <th className="px-2 py-1 text-left">Estado</th>
              <th className="px-2 py-1 text-left">Registró</th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((h) => (
              <tr key={h.id} className="border-t border-border">
                <td className="px-2 py-1.5 tabular-nums">{h.vigenteDesde}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{pesosDec(h.valor)}</td>
                <td className="px-2 py-1.5 text-xs">{BASE_LABEL[h.base]}</td>
                <td className="px-2 py-1.5">{h.activo ? <Badge tone="success">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                <td className="px-2 py-1.5 text-xs">
                  {h.creadoPor ?? '—'} · {new Date(h.createdAt).toLocaleDateString('es-CO')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

function ReglasCorte({ clienteId, clienteNombre }: { clienteId: string; clienteNombre: string | null }) {
  const q = useReglasCorte(clienteId);
  const guardar = useGuardarReglas();
  const [reglas, setReglas] = useState<ReglaCorte[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [soloMarcados, setSoloMarcados] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (q.data) {
      setReglas(q.data);
      setSucio(false);
    }
  }, [q.data]);

  const visibles = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return reglas.filter(
      (r) => (!soloMarcados || r.retoma || r.piking || r.congelacion) && (!t || r.codigo.includes(t) || r.nombre.toUpperCase().includes(t)),
    );
  }, [reglas, busqueda, soloMarcados]);

  const cambiar = (productId: string, cambio: Partial<ReglaCorte>) => {
    setReglas((prev) => prev.map((r) => (r.productId === productId ? { ...r, ...cambio } : r)));
    setSucio(true);
  };

  async function guardarReglas() {
    setMsg(null);
    try {
      await guardar.mutateAsync({
        clienteId: clienteId || undefined,
        reglas: reglas
          .filter((r) => r.retoma || r.piking || r.congelacion)
          .map(({ productId, retoma, piking, congelacion, kgCongelados }) => ({ productId, retoma, piking, congelacion, kgCongelados })),
      });
      setMsg({ ok: true, texto: 'Reglas guardadas. El TCA de los talleres ya usa estas retomas.' });
    } catch (e) {
      setMsg({ ok: false, texto: mensajeError(e, 'No se pudieron guardar las reglas.') });
    }
  }

  return (
    <Card className="flex shrink-0 flex-col gap-3 p-4">
      <p className="text-sm text-muted-foreground">
        <strong>Retoma</strong> resta del peso frío para el TCA. <strong>Piking</strong> y <strong>Congelación</strong> se cobran con sus tarifas
        sobre los kilos del corte (o los kilos habituales que indiques). {clienteNombre ? `Al guardar, ${clienteNombre} queda con sus propias reglas.` : 'Estas reglas generales aplican a los clientes sin reglas propias.'}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-80">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Buscar corte" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloMarcados} onChange={(e) => setSoloMarcados(e.target.checked)} />
          Solo con reglas
        </label>
        <div className="flex-1" />
        <Button onClick={guardarReglas} disabled={!sucio || guardar.isPending}>
          <Save /> Guardar reglas
        </Button>
      </div>
      {msg && (
        <p className={cn('rounded-md border px-3 py-2 text-sm', msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800')}>
          {msg.texto}
        </p>
      )}
      <div className="scrollbar-app max-h-[60vh] overflow-auto rounded-md border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Corte</th>
              <th className="px-3 py-2 text-center">Retoma</th>
              <th className="px-3 py-2 text-center">Piking</th>
              <th className="px-3 py-2 text-center">Congelación</th>
              <th className="w-40 px-3 py-2 text-right">Kg congelados</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr key={r.productId} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-1.5 tabular-nums">{r.codigo}</td>
                <td className="px-3 py-1.5">
                  {r.nombre}
                  {clienteId && r.origen === 'general' && <span className="ml-2 text-xs text-muted-foreground">(general)</span>}
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input type="checkbox" checked={r.retoma} onChange={(e) => cambiar(r.productId, { retoma: e.target.checked })} />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input type="checkbox" checked={r.piking} onChange={(e) => cambiar(r.productId, { piking: e.target.checked })} />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={r.congelacion}
                    onChange={(e) => cambiar(r.productId, { congelacion: e.target.checked, kgCongelados: e.target.checked ? r.kgCongelados : null })}
                  />
                </td>
                <td className="px-3 py-1">
                  <Input
                    inputMode="decimal"
                    className="h-8 text-right tabular-nums"
                    placeholder="Todo el corte"
                    disabled={!r.congelacion}
                    value={r.kgCongelados ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.replace(',', '.');
                      cambiar(r.productId, { kgCongelados: v === '' ? null : Number(v) || 0 });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visibles.length && <SinDatos texto="Ningún corte coincide" />}
      </div>
    </Card>
  );
}
