import { useState } from 'react';
import {
  Inbox,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { OrdenBeneficioIcon } from '@/components/icons/OrdenBeneficioIcon';
import { cn } from '@/lib/utils';
import {
  useOrdenBeneficioCandidates,
  useOrdenBeneficioList,
  useCreateOrdenBeneficio,
  useDeleteOrdenBeneficio,
  useSetSubproductoDestino,
  useRegistrarRetiroSubproducto,
  type OrdenBeneficio,
  type OrdenBeneficioCandidate,
  type OrdenBeneficioGuiaDetalle,
  type OrdenBeneficioStatus,
  type SubproductoDestino,
} from './orden-beneficio-api';

function today() {
  return new Date().toISOString().slice(0, 10);
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const statusMeta: Record<
  OrdenBeneficioStatus,
  { label: string; tone: 'neutral' | 'info' | 'success' }
> = {
  pendiente: { label: 'Pendiente', tone: 'neutral' },
  en_insensibilizacion: { label: 'En insensibilización', tone: 'info' },
  procesado: { label: 'Procesada', tone: 'success' },
};

const destinoMeta: Record<
  SubproductoDestino,
  { label: string; tone: 'neutral' | 'info' | 'success' }
> = {
  empresa: { label: 'Entrada', tone: 'success' },
  firmante: { label: 'Salida', tone: 'info' },
};

export function OrdenBeneficioPage() {
  const todayStr = today();
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);
  // Candidatos (para crear lote) siempre son del día actual.
  const candidates = useOrdenBeneficioCandidates(todayStr);
  const ordenes = useOrdenBeneficioList(from, to);
  const eliminar = useDeleteOrdenBeneficio();

  const list = ordenes.data ?? [];
  const cands = candidates.data ?? [];
  const refrescando = ordenes.isFetching || candidates.isFetching;
  const esHoy = from === todayStr && to === todayStr;

  // Selecciona un mes completo (del año de la fecha "Desde").
  function seleccionarMes(mesStr: string) {
    if (!mesStr) return;
    const year = Number((from || todayStr).slice(0, 4));
    const mm = Number(mesStr);
    const ultimo = new Date(year, mm, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    setFrom(`${year}-${pad(mm)}-01`);
    setTo(`${year}-${pad(mm)}-${pad(ultimo)}`);
  }

  const mesActual = from.slice(5, 7) === to.slice(5, 7) &&
    from.slice(0, 4) === to.slice(0, 4)
    ? String(Number(from.slice(5, 7)))
    : '';

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <OrdenBeneficioIcon className="size-9 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Orden de Beneficio
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Guías con animales cargados desde Peso en Pie. Elige una guía y
              cuántos animales incluir; cada lote lleva su consecutivo y pasa a
              Insensibilización.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="info">{todayStr}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              ordenes.refetch();
              candidates.refetch();
            }}
            disabled={refrescando}
          >
            <RefreshCw className={cn('size-4', refrescando && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Guías con animales cargados (listas para crear lote) */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <Users className="size-4" /> Guías con animales cargados
        </div>
        {candidates.isLoading ? (
          <Loading />
        ) : !cands.length ? (
          <Empty text="Aún no hay guías con animales. Carga los animales y cierra la guía en Peso en Pie para verla aquí." />
        ) : (
          <div className="space-y-3 p-4">
            {cands.map((c) => (
              <ClienteCard
                key={c.cliente}
                c={c}
                date={todayStr}
                onCreated={() => {
                  candidates.refetch();
                  ordenes.refetch();
                }}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Lotes de beneficio con filtro por mes / rango de fechas */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <OrdenBeneficioIcon className="size-4" /> Lotes de beneficio
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Mes
              <Select
                value={mesActual}
                onChange={(e) => seleccionarMes(e.target.value)}
                className="h-8 w-36"
              >
                <option value="">Todos</option>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Fecha inicio
              <Input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-40"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Fecha final
              <Input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-40"
              />
            </label>
            {!esHoy && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom(todayStr);
                  setTo(todayStr);
                }}
              >
                Hoy
              </Button>
            )}
          </div>
        </div>
        {ordenes.isLoading ? (
          <Loading />
        ) : !list.length ? (
          <Empty
            text={
              esHoy
                ? 'Aún no hay lotes hoy. Crea uno desde una guía de arriba.'
                : 'No hay lotes en el rango seleccionado.'
            }
          />
        ) : (
          <div className="overflow-auto">
            <Table>
              <THead>
                <TR>
                  <TH className="w-16">Lote N.º</TH>
                  <TH>Cliente</TH>
                  <TH>Guía</TH>
                  <TH>Fecha</TH>
                  <TH className="text-center">Animales</TH>
                  <TH>Estado</TH>
                  <TH>Vísceras</TH>
                  <TH className="text-center">Cabezas y patas</TH>
                  <TH className="w-12" />
                </TR>
              </THead>
              <TBody>
                {list.map((o) => (
                  <OrderRow
                    key={o.id}
                    o={o}
                    deleting={eliminar.isPending}
                    onDelete={() => eliminar.mutate(o.id)}
                  />
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ClienteCard({
  c,
  date,
  onCreated,
}: {
  c: OrdenBeneficioCandidate;
  date: string;
  onCreated: () => void;
}) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <THead>
          <TR>
            <TH>Guía</TH>
            <TH>Cliente</TH>
            <TH>Corral</TH>
            <TH className="text-center">En pie</TH>
            <TH className="text-center">Asignados</TH>
            <TH className="text-center">Disponibles</TH>
            <TH>Vísceras</TH>
            <TH>Cabezas y patas</TH>
            <TH className="text-right">Crear lote</TH>
          </TR>
        </THead>
        <TBody>
          {c.guiasDetalle.length ? (
            c.guiasDetalle.map((g) => (
              <GuiaLoteRow
                key={g.guia}
                cliente={c.cliente}
                g={g}
                date={date}
                onCreated={onCreated}
              />
            ))
          ) : (
            <TR>
              <TD className="text-muted-foreground" colSpan={9}>
                Sin guías registradas.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}

function GuiaLoteRow({
  cliente,
  g,
  date,
  onCreated,
}: {
  cliente: string;
  g: OrdenBeneficioGuiaDetalle;
  date: string;
  onCreated: () => void;
}) {
  const crear = useCreateOrdenBeneficio();
  const [value, setValue] = useState('');
  const [destino, setDestino] = useState<SubproductoDestino>('empresa');
  const [cabezasPatas, setCabezasPatas] = useState(false);

  const parsed = Number(value);
  const sinCupo = g.disponibles <= 0;
  const invalid =
    !Number.isInteger(parsed) || parsed < 1 || parsed > g.disponibles;

  return (
    <TR>
      <TD className="font-medium">{g.guia}</TD>
      <TD className="font-medium">{cliente}</TD>
      <TD className="text-muted-foreground">
        {g.corrales.length ? g.corrales.join(', ') : '—'}
      </TD>
      <TD className="text-center tabular-nums">{g.animalesEnPie}</TD>
      <TD className="text-center tabular-nums text-muted-foreground">
        {g.asignados}
      </TD>
      <TD
        className={cn(
          'text-center font-semibold tabular-nums',
          sinCupo && 'text-muted-foreground',
        )}
      >
        {g.disponibles}
      </TD>
      <TD>
        <Select
          value={destino}
          disabled={sinCupo}
          onChange={(e) => setDestino(e.target.value as SubproductoDestino)}
          className="h-8 w-full text-xs"
          title="Quién se queda con las vísceras (rojas y blancas) de este lote"
        >
          <option value="empresa">Entrada</option>
          <option value="firmante">Salida</option>
        </Select>
      </TD>
      <TD>
        <Select
          value={cabezasPatas ? 'si' : 'no'}
          disabled={sinCupo}
          onChange={(e) => setCabezasPatas(e.target.value === 'si')}
          className="h-8 w-full text-xs"
          title="Si se debe imprimir tiquete de cabeza y patas por cada animal al insensibilizar"
        >
          <option value="no">No</option>
          <option value="si">Sí</option>
        </Select>
      </TD>
      <TD>
        <div className="flex items-center justify-end gap-1.5">
          <input
            type="number"
            min={1}
            max={g.disponibles}
            value={value}
            disabled={sinCupo}
            placeholder={sinCupo ? '0' : String(g.disponibles)}
            onChange={(e) => setValue(e.target.value)}
            className="h-8 w-11 rounded-md border border-border bg-background px-1 text-center text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <Button
            size="icon"
            className="size-8"
            disabled={sinCupo || invalid || crear.isPending}
            onClick={() =>
              crear.mutate(
                {
                  cliente,
                  guia: g.guia,
                  animalCount: parsed,
                  date,
                  subproductoDestino: destino,
                  cabezasPatas,
                },
                {
                  onSuccess: () => {
                    setValue('');
                    onCreated();
                  },
                },
              )
            }
            title={
              sinCupo
                ? 'La guía ya tiene todos sus animales asignados.'
                : 'Crear lote'
            }
          >
            {crear.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
          </Button>
        </div>
      </TD>
    </TR>
  );
}

function OrderRow({
  o,
  deleting,
  onDelete,
}: {
  o: OrdenBeneficio;
  deleting: boolean;
  onDelete: () => void;
}) {
  const meta = statusMeta[o.status];
  const dMeta = destinoMeta[o.subproductoDestino];
  const registrarRetiro = useRegistrarRetiroSubproducto();
  const setDestino = useSetSubproductoDestino();
  const pendienteRetiro =
    o.subproductoDestino === 'firmante' && !o.subproductoRetiroAt;

  return (
    <TR>
      <TD className="font-semibold tabular-nums">{o.reference}</TD>
      <TD className="font-medium">{o.cliente}</TD>
      <TD className="text-muted-foreground">
        {o.guias.length ? o.guias.join(', ') : '—'}
      </TD>
      <TD className="tabular-nums text-muted-foreground">{o.date}</TD>
      <TD className="text-center tabular-nums">
        {o.insensibilizados}/{o.animalCount}
      </TD>
      <TD>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </TD>
      <TD>
        <div className="flex flex-col gap-1">
          {o.status === 'pendiente' ? (
            <Select
              value={o.subproductoDestino}
              disabled={setDestino.isPending}
              onChange={(e) =>
                setDestino.mutate({
                  id: o.id,
                  subproductoDestino: e.target.value as SubproductoDestino,
                })
              }
              className="h-7 text-xs"
            >
              <option value="empresa">Entrada</option>
              <option value="firmante">Salida</option>
            </Select>
          ) : (
            <Badge tone={dMeta.tone}>{dMeta.label}</Badge>
          )}
          {o.subproductoDestino === 'firmante' &&
            (o.subproductoRetiroAt ? (
              <span className="text-xs text-muted-foreground">
                Retirado {new Date(o.subproductoRetiroAt).toLocaleString('es-CO')}
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={registrarRetiro.isPending}
                onClick={() => registrarRetiro.mutate({ id: o.id })}
              >
                Registrar retiro
              </Button>
            ))}
        </div>
      </TD>
      <TD className="text-center">
        <Badge tone={o.cabezasPatas ? 'info' : 'neutral'}>
          {o.cabezasPatas ? 'Sí' : 'No'}
        </Badge>
      </TD>
      <TD className="text-right">
        {o.status === 'pendiente' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={deleting}
            title="Eliminar lote"
          >
            <Trash2 className="size-4 text-red-600" />
          </Button>
        )}
      </TD>
    </TR>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" /> Cargando…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
      <Inbox className="size-8" />
      {text}
    </div>
  );
}
