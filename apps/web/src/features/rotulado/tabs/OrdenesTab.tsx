import { Inbox, LoaderCircle } from 'lucide-react';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { RotuladoOrden, RotuladoStage } from '../api';

export function OrdenesTab({
  loading,
  ordenes,
  selected,
  onSelect,
}: {
  loading: boolean;
  ordenes: RotuladoOrden[];
  selected: RotuladoOrden | null;
  onSelect: (o: RotuladoOrden | null) => void;
  stage: RotuladoStage;
  fecha: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }

  if (ordenes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <Inbox className="size-8" />
        <p className="text-sm font-medium">No hay órdenes para esta fecha</p>
        <p className="text-sm">
          Las órdenes de traslado de M.P a sala aparecerán acá.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-24">Lote</TH>
          <TH>Cliente</TH>
          <TH className="w-32">Orden traslado</TH>
        </TR>
      </THead>
      <TBody>
        {ordenes.map((o) => (
          <TR
            key={o.id}
            onClick={() => onSelect(selected?.id === o.id ? null : o)}
            className={cn(
              'cursor-pointer',
              o.id === selected?.id && 'bg-sky-100 hover:bg-sky-100',
            )}
          >
            <TD className="font-medium tabular-nums">{o.lote}</TD>
            <TD>
              {o.clientNit} - {o.clientName}
            </TD>
            <TD className="tabular-nums">{o.ordenTraslado}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
