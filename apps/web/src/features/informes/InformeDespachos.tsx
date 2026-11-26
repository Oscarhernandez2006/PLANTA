import { useMemo, useState } from 'react';
import { ChevronRight, Inbox, LoaderCircle, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useAuth } from '../auth/auth-context';
import {
  formatGM,
  useDespachosCerrados,
  useRemisiones,
  type DespachoCerrado,
  type RemisionResumen,
  type VistaRemision,
} from '../guias-transporte/api';
import { DescargarRemision, MarcoPdf, PestanasVista, useUrlRemision } from '../guias-transporte/VisorRemision';
import { formatDC } from '../registrar/despacho-canales-api';
import { FiltrosInforme, useFiltrosInforme, usePeriodoInforme } from './InformesPage';

const TIPO_TEXTO: Record<DespachoCerrado['tipo'], string> = { caliente: 'Caliente', frio: 'Frío', posta: 'Posta' };

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });

const destinoDe = (f: DespachoCerrado) =>
  f.puntoEnvio
    ? `${f.puntoEnvio}${f.municipio ? ` · ${f.municipio}` : ''}`
    : f.remisiones > 1
      ? `${f.remisiones} tiendas`
      : 'Mismo cliente';

/** Informes → Despachos: órdenes DC cerradas en el periodo; al abrir una se ve su remisión. */
export function InformeDespachos() {
  const { rango } = usePeriodoInforme();
  const filtros = useFiltrosInforme();
  const consulta = useDespachosCerrados({ ...rango, buscar: filtros.busqueda.trim() });
  const [abierta, setAbierta] = useState<DespachoCerrado | null>(null);
  const todas = consulta.data ?? [];
  const filas = todas.filter(
    (f) => (!filtros.cliente || f.cliente === filtros.cliente) && (!filtros.estado || f.tipo === filtros.estado),
  );
  const clientes = [...new Set([...todas.map((f) => f.cliente), ...(filtros.cliente ? [filtros.cliente] : [])])].sort();
  const tipos = [...new Set(todas.map((f) => f.tipo))];
  const disponible = !consulta.isLoading && !consulta.isError;

  return (
    <>
      <section className="@container order-2 min-h-[27rem] min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-start-2 lg:row-start-2">
        <header className="px-4 py-4 sm:px-5">
          <h2 className="text-lg font-semibold tracking-tight">Informes de despacho</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Órdenes de despacho caliente, frío y posta cerradas, con su remisión (guía de transporte).
          </p>
        </header>
        <div className="mx-3 rounded-lg bg-muted/50 px-3 py-2.5">
          <FiltrosInforme
            filtros={{ ...filtros, clientes, estados: tipos }}
            estados={TIPO_TEXTO}
            todosEstados="Todos los tipos"
          />
        </div>
        <div className="px-4 py-2.5 sm:px-5">
          <p className="text-xs text-muted-foreground">
            {disponible && (
              <>
                <span className="font-semibold text-primary">
                  {filas.length} {filas.length === 1 ? 'orden' : 'órdenes'}
                </span>{' '}
                ·{' '}
              </>
            )}
            {filas.length > 0 && disponible ? 'Selecciona una orden para ver su remisión.' : 'Resultados del periodo seleccionado.'}
          </p>
        </div>
        {!disponible || !filas.length ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 p-5 text-center text-sm text-muted-foreground">
            {consulta.isLoading ? (
              <div role="status" className="w-full space-y-2">
                <span className="sr-only">Cargando despachos…</span>
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-8 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : consulta.isError ? (
              <>
                <p role="alert" className="text-destructive">No se pudieron cargar los despachos.</p>
                <Button variant="outline" onClick={() => void consulta.refetch()}>Reintentar</Button>
              </>
            ) : (
              <>
                <Inbox className="size-7" />
                No hay órdenes de despacho que coincidan con los filtros.
              </>
            )}
          </div>
        ) : (
          <>
            <div className="mx-4 mb-4 hidden overflow-hidden rounded-lg border border-border/60 sm:mx-5 @min-[44rem]:block">
              <Table>
                <THead className="bg-muted/45">
                  <TR>
                    {['Orden', 'Cliente', 'Destino', 'Tipo', 'Fecha de cierre', 'Guía'].map((c) => (
                      <TH key={c} scope="col" className={cn('h-11 px-4 py-2 leading-snug', c === 'Cliente' && 'w-1/4')}>
                        {c}
                      </TH>
                    ))}
                    <TH scope="col" className="w-11 px-3"><span className="sr-only">Detalle</span></TH>
                  </TR>
                </THead>
                <TBody>
                  {filas.map((f) => (
                    <TR key={f.id} onClick={() => setAbierta(f)} className="cursor-pointer border-border/60 hover:bg-primary/5">
                      <TD className="px-4 py-3.5">
                        <button
                          type="button"
                          className="font-semibold whitespace-nowrap text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAbierta(f);
                          }}
                        >
                          {formatDC(f.dcNumber)}
                        </button>
                      </TD>
                      <TD className="px-4 py-3.5 font-medium leading-snug uppercase wrap-anywhere">{f.cliente}</TD>
                      <TD className={cn('px-4 py-3.5 leading-snug uppercase wrap-anywhere', !f.puntoEnvio && 'text-muted-foreground')}>
                        {destinoDe(f)}
                      </TD>
                      <TD className="px-4 py-3.5">{TIPO_TEXTO[f.tipo]}</TD>
                      <TD className="px-4 py-3.5 whitespace-nowrap tabular-nums">{fechaHora(f.cerradaAt)}</TD>
                      <TD className="px-4 py-3.5 whitespace-nowrap">
                        {f.guias.length > 1 ? (
                          <>
                            <span className="font-semibold">{f.guias.map((g) => formatGM(g.numero)).join(' · ')}</span>
                            <span className="block text-xs text-muted-foreground">{f.remisiones} remisiones</span>
                          </>
                        ) : f.guia ? (
                          <>
                            <span className="font-semibold">{formatGM(f.guia.numero)}</span>
                            {f.remisiones > 1 && (
                              <span className="block text-xs text-muted-foreground">{f.remisiones} remisiones</span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Sin guía</span>
                        )}
                      </TD>
                      <TD className="px-3 py-3.5 text-muted-foreground"><ChevronRight aria-hidden="true" className="size-4" /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <ul className="divide-y divide-border/60 @min-[44rem]:hidden">
              {filas.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setAbierta(f)}
                    className="flex w-full min-w-0 items-center gap-2 px-4 py-3 text-left hover:bg-primary/5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-primary">
                        {formatDC(f.dcNumber)} · {TIPO_TEXTO[f.tipo]}
                      </span>
                      <span className="block text-sm uppercase">{f.cliente}</span>
                      <span className="block text-xs text-muted-foreground">
                        {fechaHora(f.cerradaAt)} · {destinoDe(f)}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {abierta && <RemisionDialog orden={abierta} onClose={() => setAbierta(null)} />}
    </>
  );
}

/**
 * Remisión de la orden: abre en vista cliente, con pestaña para pasar a la vista interna.
 * Con remisiones por tienda, a la izquierda se listan agrupadas por guía (camión).
 */
function RemisionDialog({ orden, onClose }: { orden: DespachoCerrado; onClose: () => void }) {
  const { user } = useAuth();
  const operario = user?.fullName ?? '';
  const [vista, setVista] = useState<VistaRemision>('cliente');
  const varias = orden.remisiones > 1;
  const remisiones = useRemisiones(varias ? orden.id : null);
  const lista = remisiones.data ?? [];
  const [elegida, setElegida] = useState<string | null>(null);
  const pickingId = varias ? (elegida ?? lista[0]?.pickingId ?? null) : null;
  // Con varias remisiones, el PDF espera a saber cuál mostrar.
  const { url, error } = useUrlRemision(varias && !pickingId ? '' : orden.id, operario, vista, pickingId);
  const grupos = useMemo(() => {
    const m = new Map<string, { guia: RemisionResumen['guia']; items: RemisionResumen[] }>();
    for (const r of lista) {
      const k = r.guia ? String(r.guia.numero) : '-';
      const g = m.get(k) ?? { guia: r.guia, items: [] };
      g.items.push(r);
      m.set(k, g);
    }
    return [...m.values()];
  }, [lista]);

  return (
    <Dialog
      open
      onClose={onClose}
      title=""
      className={cn(
        'mt-0 h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] [&>div:first-child]:items-center [&>div:first-child]:px-4 [&>div:first-child]:py-2.5 [&_[data-dialog-body]]:p-3',
        varias ? 'max-w-[min(96vw,76rem)]' : 'max-w-[min(96vw,56rem)]',
      )}
      scrollInterno
      acciones={
        <>
          <PestanasVista vista={vista} onChange={setVista} />
          <DescargarRemision dcId={orden.id} operario={operario} vista={vista} pickingId={pickingId} disabled={!url} />
        </>
      }
    >
      {varias ? (
        <div className="flex h-full min-h-[20rem] gap-3">
          <nav aria-label="Remisiones" className="scrollbar-app w-64 shrink-0 space-y-3 overflow-auto">
            <p className="px-1 text-xs text-muted-foreground">
              {formatDC(orden.dcNumber)} · <b className="text-foreground">{orden.remisiones} remisiones</b> en{' '}
              {orden.guias.length} guía{orden.guias.length === 1 ? '' : 's'}
            </p>
            {remisiones.isLoading ? (
              <LoaderCircle className="mx-auto size-5 animate-spin text-muted-foreground" />
            ) : (
              grupos.map((g) => (
                <section key={g.guia?.numero ?? '-'} className="space-y-1">
                  <h4 className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1.5 text-xs">
                    <Truck className="size-3.5 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {g.guia ? `${formatGM(g.guia.numero)} · ${g.guia.placa}` : 'Sin guía'}
                      </span>
                      {g.guia && <span className="block truncate uppercase text-muted-foreground">{g.guia.conductor}</span>}
                    </span>
                  </h4>
                  {g.items.map((r) => {
                    const activa = r.pickingId === pickingId;
                    return (
                      <button
                        key={r.pickingId ?? r.codigo}
                        type="button"
                        onClick={() => setElegida(r.pickingId)}
                        className={cn(
                          'w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                          activa ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/60',
                        )}
                      >
                        <span className={cn('block font-semibold', activa && 'text-primary')}>{r.codigo}</span>
                        <span className="block truncate uppercase">{r.destino}</span>
                        <span className="block text-muted-foreground">
                          {r.ocNumero ? `OC ${r.ocNumero} · ` : ''}
                          {r.empaques ?? 0} emp. · {(r.kg ?? 0).toLocaleString('es-CO')} kg
                        </span>
                      </button>
                    );
                  })}
                </section>
              ))
            )}
          </nav>
          <MarcoPdf url={url} error={error || remisiones.isError} className="h-full min-w-0 flex-1 overflow-hidden rounded-md border" />
        </div>
      ) : (
        <MarcoPdf url={url} error={error} className="h-full min-h-[20rem] overflow-hidden rounded-md border" />
      )}
    </Dialog>
  );
}
