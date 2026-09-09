import { useState } from 'react';
import {
  CheckCircle2,
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
import { Dialog } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { OrdenBeneficioIcon } from '@/components/icons/OrdenBeneficioIcon';
import { cn } from '@/lib/utils';
import {
  useOrdenBeneficioCandidates,
  useOrdenBeneficioList,
  useCreateOrdenBeneficio,
  useDeleteOrdenBeneficio,
  type OrdenBeneficio,
  type OrdenBeneficioCandidate,
  type OrdenBeneficioStatus,
} from './orden-beneficio-api';

function today() {
  return new Date().toISOString().slice(0, 10);
}

const statusMeta: Record<
  OrdenBeneficioStatus,
  { label: string; tone: 'neutral' | 'info' | 'success' }
> = {
  pendiente: { label: 'Pendiente', tone: 'neutral' },
  en_insensibilizacion: { label: 'En insensibilización', tone: 'info' },
  procesado: { label: 'Procesada', tone: 'success' },
};

export function OrdenBeneficioPage() {
  const [date] = useState(today());
  const [modalOpen, setModalOpen] = useState(false);
  const ordenes = useOrdenBeneficioList(date);
  const eliminar = useDeleteOrdenBeneficio();

  const list = ordenes.data ?? [];

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
              Clientes del día con animales validados en Peso en Pie. Al crear la
              orden pasa a Insensibilización.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="info">{date}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => ordenes.refetch()}
            disabled={ordenes.isFetching}
          >
            <RefreshCw
              className={cn('size-4', ordenes.isFetching && 'animate-spin')}
            />
            Actualizar
          </Button>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="size-4" /> Nueva orden
          </Button>
        </div>
      </div>

      {/* Órdenes creadas hoy */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <OrdenBeneficioIcon className="size-4" /> Órdenes creadas
        </div>
        {ordenes.isLoading ? (
          <Loading />
        ) : !list.length ? (
          <Empty text="Aún no se han creado órdenes hoy. Usa “+ Nueva orden”." />
        ) : (
          <div className="overflow-auto">
            <Table>
              <THead>
                <TR>
                  <TH className="w-12">N.º</TH>
                  <TH>Cliente</TH>
                  <TH>Guías</TH>
                  <TH className="text-center">Animales</TH>
                  <TH>Estado</TH>
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

      <NuevaOrdenDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        date={date}
      />
    </div>
  );
}

function NuevaOrdenDialog({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
}) {
  const candidates = useOrdenBeneficioCandidates(date);
  const crear = useCreateOrdenBeneficio();
  const cands = candidates.data ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nueva Orden de Beneficio"
      description="Guías del día con sus animales validados en Peso en Pie."
      className="max-w-3xl"
    >
      {candidates.isLoading ? (
        <Loading />
      ) : !cands.length ? (
        <Empty text="No hay clientes en Peso en Camión para hoy." />
      ) : (
        <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
          {cands.map((c) => (
            <ClienteCard
              key={c.cliente}
              c={c}
              creating={crear.isPending}
              onCreate={() =>
                crear.mutate(
                  { cliente: c.cliente, date },
                  { onSuccess: () => candidates.refetch() },
                )
              }
            />
          ))}
        </div>
      )}
    </Dialog>
  );
}

function ClienteCard({
  c,
  creating,
  onCreate,
}: {
  c: OrdenBeneficioCandidate;
  creating: boolean;
  onCreate: () => void;
}) {
  const sinAnimales = c.animalesEnPie <= 0;
  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <span className="font-semibold">{c.cliente}</span>
          <Badge tone="neutral">{c.animalesEnPie} animales</Badge>
        </div>
        {c.yaCreada ? (
          <Badge tone="success">
            <CheckCircle2 className="mr-1 size-3.5" /> Orden creada
          </Badge>
        ) : (
          <Button
            size="sm"
            onClick={onCreate}
            disabled={creating || sinAnimales}
            title={
              sinAnimales
                ? 'El cliente no tiene animales validados en Peso en Pie.'
                : 'Crear Orden de Beneficio'
            }
          >
            {creating ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Crear orden
          </Button>
        )}
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Guía</TH>
            <TH className="text-center">Animales en pie</TH>
          </TR>
        </THead>
        <TBody>
          {c.guiasDetalle.length ? (
            c.guiasDetalle.map((g) => (
              <TR key={g.guia}>
                <TD className="font-medium">{g.guia}</TD>
                <TD
                  className={cn(
                    'text-center font-semibold tabular-nums',
                    g.animalesEnPie === 0 && 'text-muted-foreground',
                  )}
                >
                  {g.animalesEnPie}
                </TD>
              </TR>
            ))
          ) : (
            <TR>
              <TD className="text-muted-foreground" colSpan={2}>
                Sin guías registradas.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
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
  return (
    <TR>
      <TD className="font-semibold tabular-nums">{o.reference}</TD>
      <TD className="font-medium">{o.cliente}</TD>
      <TD className="text-muted-foreground">
        {o.guias.length ? o.guias.join(', ') : '—'}
      </TD>
      <TD className="text-center tabular-nums">
        {o.insensibilizados}/{o.animalCount}
      </TD>
      <TD>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </TD>
      <TD className="text-right">
        {o.status === 'pendiente' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={deleting}
            title="Eliminar orden"
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
