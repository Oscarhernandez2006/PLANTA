import { useState } from 'react';
import { PackageSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';
import {
  orderTypeLabel,
  statusLabels,
  statusTone,
  useDispatchOrders,
  type DispatchOrder,
  type DispatchOrderStatus,
} from './api';

export function OrdenesDespachoTab({
  onSelect,
}: {
  onSelect: (order: DispatchOrder) => void;
}) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<DispatchOrderStatus | ''>('');
  const pageSize = 20;

  const { data, isLoading, isError } = useDispatchOrders({
    page,
    pageSize,
    status: status || undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as DispatchOrderStatus | '');
            setPage(1);
          }}
          className="h-9 w-48"
        >
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
          <option value="facturado">Facturado</option>
        </Select>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.pagination.total} orden
            {data.pagination.total === 1 ? '' : 'es'}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-lg" />
          ))}

        {isError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
            Error al cargar las órdenes.
          </p>
        )}

        {data && data.data.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-14 text-center">
            <PackageSearch className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Sin órdenes de despacho</p>
            <p className="text-sm text-muted-foreground">
              Registrá la primera desde la pestaña “Registro O.D.”.
            </p>
          </div>
        )}

        {data?.data.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o)}
            className="flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <div className="w-16 shrink-0 text-center">
              <div className="text-xl font-semibold tabular-nums text-primary">
                {o.odNumber}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                O.D.
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {o.client.name}{' '}
                <span className="text-muted-foreground">({o.client.sede})</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {orderTypeLabel} · Proceso {formatDate(o.processDate)}
              </div>
            </div>
            <Badge tone={statusTone[o.status]}>{statusLabels[o.status]}</Badge>
          </button>
        ))}
      </div>

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
    </div>
  );
}
