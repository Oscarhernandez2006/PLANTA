import { useState } from 'react';
import { FileDown, LoaderCircle, Pencil, Plus, RefreshCw, Save, ScrollText, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { cn, formatFechaDia } from '@/lib/utils';
import { useAuth } from '../auth/auth-context';
import { formatDC } from '../registrar/despacho-canales-api';
import {
  descargarGuiaDespacho,
  formatGM,
  useActualizarGuia,
  useCrearGuia,
  useGuiasTransporte,
  useNextGuiaNumber,
  type GuiaTransporte,
} from './api';
import { GuiaCampos, guiaPayload, guiaVacia, guiaValida, hoyISO, mensajeApi, type GuiaValores } from './components';

const TIPO_TEXTO = { caliente: 'Caliente', frio: 'Frío', posta: 'Posta' } as const;

function haceDias(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
}

/** Logística → Guías de transporte: crear, editar y consultar las guías (GM) y sus órdenes DC. */
export function GuiasTransportePage() {
  const { user } = useAuth();
  const [buscar, setBuscar] = useState('');
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(hoyISO());
  const guias = useGuiasTransporte({ buscar: buscar.trim(), desde, hasta });
  const crear = useCrearGuia();
  const actualizar = useActualizarGuia();
  const [form, setForm] = useState<GuiaTransporte | 'nueva' | null>(null);
  const [valores, setValores] = useState<GuiaValores>(guiaVacia);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const next = useNextGuiaNumber(form === 'nueva');
  const editando = form && form !== 'nueva' ? form : null;
  const guardando = crear.isPending || actualizar.isPending;
  const rows = guias.data ?? [];
  const elegida = rows.find((g) => g.id === seleccion) ?? null;

  function abrir(g: GuiaTransporte | 'nueva') {
    setForm(g);
    setError(null);
    setValores(
      g === 'nueva'
        ? guiaVacia()
        : {
            fecha: g.fecha,
            tipoVehiculo: g.tipoVehiculo,
            placa: g.placa,
            conductor: g.conductor,
            cedula: g.cedula ?? '',
            observacion: g.observacion ?? '',
          },
    );
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const datos = guiaPayload(valores);
      const g = editando
        ? await actualizar.mutateAsync({ id: editando.id, ...datos })
        : await crear.mutateAsync(datos);
      setForm(null);
      setSeleccion(g.id);
      setAviso(`Guía ${formatGM(g.numero)} ${editando ? 'actualizada' : 'creada'}.`);
    } catch (err) {
      setError(mensajeApi(err, 'No se pudo guardar la guía de transporte.'));
    }
  }

  async function descargar(dcId: string, pickingId?: string) {
    setDescargando(pickingId ?? dcId);
    setAviso(null);
    try {
      await descargarGuiaDespacho(dcId, user?.fullName ?? '', 'cliente', pickingId);
    } catch (err) {
      setAviso(mensajeApi(err, 'No se pudo generar el PDF de la guía.'));
    } finally {
      setDescargando(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-end gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <ScrollText className="size-7 text-primary" />
        <div className="mr-auto">
          <h2 className="text-lg font-bold">Guías de transporte</h2>
          <p className="text-sm text-muted-foreground">
            Vehículo y conductor de cada despacho. Las órdenes DC se amarran a la guía al cerrarlas.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="guias-buscar">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="guias-buscar"
              className="h-10 w-56 pl-8"
              placeholder="GM, placa o conductor"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="guias-desde">Desde</Label>
          <Input id="guias-desde" type="date" className="h-10" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="guias-hasta">Hasta</Label>
          <Input id="guias-hasta" type="date" className="h-10" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <Button variant="outline" className="h-10" onClick={() => guias.refetch()} disabled={guias.isFetching}>
          <RefreshCw className={cn('size-4', guias.isFetching && 'animate-spin')} />
          Refrescar
        </Button>
        <Button className="h-10" onClick={() => abrir('nueva')}>
          <Plus className="size-4" />
          Nueva guía
        </Button>
      </div>

      {aviso && (
        <p className="flex shrink-0 items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          {aviso}
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso">
            <X className="size-4" />
          </button>
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="scrollbar-app min-h-0 overflow-auto rounded-xl border border-border bg-card">
          <Table>
            <THead>
              <TR>
                <TH>Guía</TH>
                <TH>Fecha</TH>
                <TH>Vehículo</TH>
                <TH>Placa</TH>
                <TH>Conductor</TH>
                <TH className="text-center">Órdenes</TH>
                <TH className="w-24 text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {guias.isLoading ? (
                <TR>
                  <TD colSpan={7} className="py-8 text-center text-muted-foreground">
                    Cargando…
                  </TD>
                </TR>
              ) : rows.length === 0 ? (
                <TR>
                  <TD colSpan={7} className="py-8 text-center text-muted-foreground">
                    No hay guías de transporte en el periodo.
                  </TD>
                </TR>
              ) : (
                rows.map((g) => (
                  <TR
                    key={g.id}
                    className={cn('cursor-pointer', seleccion === g.id && 'bg-emerald-50')}
                    onClick={() => setSeleccion(g.id)}
                  >
                    <TD className="font-bold tabular-nums text-primary">{formatGM(g.numero)}</TD>
                    <TD className="tabular-nums">{formatFechaDia(g.fecha)}</TD>
                    <TD>{g.tipoVehiculo}</TD>
                    <TD className="font-semibold tracking-wider">{g.placa}</TD>
                    <TD>{g.conductor}</TD>
                    <TD className="text-center tabular-nums">{g.despachos.length}</TD>
                    <TD>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrir(g);
                          }}
                        >
                          <Pencil className="size-4" />
                          Editar
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>

        <aside className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-4">
          {!elegida ? (
            <p className="m-auto text-center text-sm text-muted-foreground">
              Selecciona una guía para ver sus órdenes de despacho y descargar las remisiones.
            </p>
          ) : (
            <>
              <div className="shrink-0 space-y-1 border-b border-border pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-primary">{formatGM(elegida.numero)}</span>
                  <span className="text-sm text-muted-foreground">{formatFechaDia(elegida.fecha)}</span>
                </div>
                <p className="text-sm">
                  {elegida.tipoVehiculo} · <b className="tracking-wider">{elegida.placa}</b>
                </p>
                <p className="text-sm">
                  {elegida.conductor}
                  {elegida.cedula && <span className="text-muted-foreground"> · C.C. {elegida.cedula}</span>}
                </p>
                {elegida.observacion && <p className="text-xs text-muted-foreground">{elegida.observacion}</p>}
              </div>
              <h3 className="mt-3 shrink-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Órdenes de despacho ({elegida.despachos.length})
              </h3>
              <div className="scrollbar-app mt-2 min-h-0 flex-1 space-y-2 overflow-auto">
                {elegida.despachos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aún no tiene órdenes. Se amarran al cerrar una orden de despacho caliente, frío o posta.
                  </p>
                ) : (
                  elegida.despachos.flatMap((d) =>
                    // Remisiones por tienda: un renglón (y un PDF) por cada tienda de este camión.
                    (d.tiendas.length ? d.tiendas : [null]).map((t) => {
                      const clave = t?.pickingId ?? d.id;
                      return (
                    <div key={clave} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">
                          {formatDC(d.dcNumber)}{' '}
                          <span className="text-xs font-normal text-muted-foreground">{TIPO_TEXTO[d.tipo]}</span>
                        </div>
                        <div className="truncate text-xs uppercase text-muted-foreground">
                          {t
                            ? `${t.nombre} (${d.cliente})`
                            : d.puntoEnvio
                              ? `${d.puntoEnvio} (cliente de ${d.cliente})`
                              : d.cliente}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={descargando === clave}
                        onClick={() => void descargar(d.id, t?.pickingId)}
                        title="Descargar la guía de transporte (remisión)"
                      >
                        {descargando === clave ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <FileDown className="size-4" />
                        )}
                        PDF
                      </Button>
                    </div>
                      );
                    }),
                  )
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {form && (
        <Dialog
          open
          onClose={() => setForm(null)}
          title={editando ? `Editar guía ${formatGM(editando.numero)}` : 'Nueva guía de transporte'}
          className="max-w-3xl"
        >
          <form onSubmit={guardar}>
            <GuiaCampos
              valores={valores}
              onChange={setValores}
              numero={
                editando
                  ? formatGM(editando.numero)
                  : next.data
                    ? `${formatGM(next.data.next)} (al guardar)`
                    : undefined
              }
            />
            <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" className="h-10" onClick={() => setForm(null)}>
                <X className="size-4" />
                Cancelar
              </Button>
              <Button type="submit" className="h-10 px-6" disabled={!guiaValida(valores) || guardando}>
                <Save className="size-4" />
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
            {error && (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
          </form>
        </Dialog>
      )}
    </div>
  );
}
