import { useState } from 'react';
import { PackagePlus, PackageSearch } from 'lucide-react';
import { GoodsReceiptStatus } from '@frigorifico/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { useGoodsReceipts } from './api';
import { CreateGoodsReceiptDialog } from './CreateGoodsReceiptDialog';
import { statusLabels, statusTone } from './labels';

export function GoodsReceiptsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<GoodsReceiptStatus | ''>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const pageSize = 15;

  const { data, isLoading, isError } = useGoodsReceipts({
    page,
    pageSize,
    status: status || undefined,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ingresos de mercancía
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recepción de canales, medias canales y cuartos desde faena — punto
            de partida de la trazabilidad.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <PackagePlus /> Nuevo ingreso
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as GoodsReceiptStatus | '');
            setPage(1);
          }}
          className="w-56"
        >
          <option value="">Todos los estados</option>
          {Object.values(GoodsReceiptStatus).map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </Select>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.pagination.total} ingreso
            {data.pagination.total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>N.º ingreso</TH>
              <TH>Proveedor / origen</TH>
              <TH className="text-center">Ítems</TH>
              <TH>Estado</TH>
              <TH>Recibido</TH>
            </TR>
          </THead>
          <TBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TR key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TD key={j}>
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </TD>
                  ))}
                </TR>
              ))}

            {isError && (
              <TR>
                <TD colSpan={5} className="py-10 text-center text-sm text-red-600">
                  Error al cargar los ingresos. ¿Está corriendo la API?
                </TD>
              </TR>
            )}

            {data && data.data.length === 0 && (
              <TR>
                <TD colSpan={5}>
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <PackageSearch className="size-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium">Sin ingresos aún</p>
                    <p className="text-sm text-muted-foreground">
                      Registrá el primer ingreso para arrancar la trazabilidad.
                    </p>
                  </div>
                </TD>
              </TR>
            )}

            {data?.data.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{r.receiptNumber}</TD>
                <TD>
                  <div>{r.supplier.name}</div>
                  {r.originIcaCode && (
                    <div className="text-xs text-muted-foreground">
                      {r.originIcaCode}
                    </div>
                  )}
                </TD>
                <TD className="text-center tabular-nums">{r._count.items}</TD>
                <TD>
                  <Badge tone={statusTone[r.status]}>
                    {statusLabels[r.status]}
                  </Badge>
                </TD>
                <TD className="text-muted-foreground">
                  {formatDateTime(r.receivedAt)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {data.pagination.page} de {data.pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <CreateGoodsReceiptDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
