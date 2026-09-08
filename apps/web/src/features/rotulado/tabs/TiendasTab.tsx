import { Inbox, Store } from 'lucide-react';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import type { RotuladoOrden } from '../api';

export function TiendasTab({ orden }: { orden: RotuladoOrden | null }) {
  if (!orden) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <Store className="size-8" />
        <p className="text-sm font-medium">Seleccioná una orden</p>
        <p className="text-sm">
          Elegí una orden en la pestaña Órdenes para ver sus tiendas.
        </p>
      </div>
    );
  }

  const tiendas = orden.tiendas ?? [];

  if (tiendas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <Inbox className="size-8" />
        <p className="text-sm font-medium">Sin tiendas registradas</p>
        <p className="text-sm">
          {orden.clientNit} - {orden.clientName}
        </p>
      </div>
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-32">Código</TH>
          <TH>Tienda</TH>
          <TH className="w-32">Ref.</TH>
        </TR>
      </THead>
      <TBody>
        {tiendas.map((t) => (
          <TR key={t.codTienda}>
            <TD className="font-medium tabular-nums">
              {orden.clientNit}-{t.codTienda}
            </TD>
            <TD>{t.nombre}</TD>
            <TD>{t.ref ?? 'N/A'}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
