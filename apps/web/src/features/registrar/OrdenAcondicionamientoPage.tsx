import { useMemo, useState } from 'react';
import { PackageCheck, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Input, Label, Select } from '@/components/ui/input';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { plantToday as today } from '@/lib/utils';
import { useClientesActivos, type OrdenDespachoStatus } from './orden-despacho-api';
import { formatOT } from './orden-traslado-api';
import {
  formatOC,
  useCreateOrdenAcondicionamiento,
  useOrdenAcondicionamientoNextNumber,
  useOrdenesTrasladoCerradas,
} from './orden-acondicionamiento-api';

/** Día siguiente a `iso` (YYYY-MM-DD). */
function manana(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function OrdenAcondicionamientoPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <PackageCheck className="size-9 text-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orden de Acondicionamiento</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Registra una orden de acondicionamiento para un cliente.
          </p>
        </div>
      </div>
      <RegistrarOrdenAcondicionamientoForm />
    </div>
  );
}

function RegistrarOrdenAcondicionamientoForm() {
  const hoy = today();
  const keyboard = useKeyboard();
  const next = useOrdenAcondicionamientoNextNumber();
  const crear = useCreateOrdenAcondicionamiento();
  const clientes = useClientesActivos();
  const ordenesTraslado = useOrdenesTrasladoCerradas();

  const [processDate, setProcessDate] = useState(manana(hoy));
  const [clienteId, setClienteId] = useState('');
  const [transferOrderId, setTransferOrderId] = useState('');
  const [status, setStatus] = useState<OrdenDespachoStatus>('activo');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const clienteOptions = useMemo(
    () =>
      (clientes.data ?? []).map((c) => ({
        value: c.id,
        label: `${c.nit ?? 'SIN NIT'} - ${c.concepto}`,
      })),
    [clientes.data],
  );

  const otDelCliente = useMemo(
    () => (ordenesTraslado.data ?? []).filter((o) => o.cliente.id === clienteId),
    [ordenesTraslado.data, clienteId],
  );

  function elegirCliente(id: string) {
    setClienteId(id);
    setTransferOrderId('');
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    if (!clienteId) return setError('Selecciona el cliente.');
    if (!transferOrderId) return setError('Selecciona la orden de traslado.');
    if (!processDate) return setError('Selecciona la fecha de proceso.');
    try {
      const created = await crear.mutateAsync({
        clienteId,
        transferOrderId,
        registrationDate: hoy,
        processDate,
        status,
      });
      setOkMsg(
        `Orden de acondicionamiento ${formatOC(created.ocNumber)} registrada (${formatOT(created.transferOrder.otNumber)}).`,
      );
      void next.refetch();
      setProcessDate(manana(hoy));
      setClienteId('');
      setTransferOrderId('');
      setStatus('activo');
    } catch (err) {
      const detail = (
        err as { response?: { data?: { message?: string | string[] } } }
      ).response?.data?.message;
      setError(
        Array.isArray(detail)
          ? detail.join(' ')
          : detail || 'No se pudo registrar la orden de acondicionamiento.',
      );
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Registrar orden de acondicionamiento</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={guardar} className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              OC N.º
            </Label>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-primary">
              {next.data ? formatOC(next.data.next) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              Se asigna automáticamente al guardar.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="oc-fec-registro">Fecha de registro</Label>
              <Input id="oc-fec-registro" type="date" className="h-9" value={hoy} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oc-fec-proceso">Fecha de proceso</Label>
              <Input
                id="oc-fec-proceso"
                type="date"
                className="h-9"
                value={processDate}
                min={hoy}
                onChange={(e) => setProcessDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="oc-cliente">Cliente</Label>
            <Combobox
              id="oc-cliente"
              className="h-9"
              options={clienteOptions}
              value={clienteId}
              onChange={elegirCliente}
              placeholder={clientes.isLoading ? 'Cargando…' : 'Buscar cliente por NIT o nombre…'}
              emptyText="Sin clientes activos"
              onKeyboard={keyboard.open}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="oc-ot">Orden de traslado (cerrada)</Label>
              <Select
                id="oc-ot"
                className="h-9"
                value={transferOrderId}
                disabled={!clienteId}
                onChange={(e) => setTransferOrderId(e.target.value)}
              >
                <option value="">
                  {!clienteId
                    ? 'Primero selecciona el cliente'
                    : otDelCliente.length
                      ? 'Selecciona la orden de traslado'
                      : 'El cliente no tiene órdenes de traslado cerradas'}
                </option>
                {otDelCliente.map((o) => (
                  <option key={o.id} value={o.id}>
                    {formatOT(o.otNumber)} — proceso {o.processDate.slice(0, 10)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oc-estado">Estado</Label>
              <Select
                id="oc-estado"
                className="h-9"
                value={status}
                onChange={(e) => setStatus(e.target.value as OrdenDespachoStatus)}
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
                <option value="facturado">Facturado</option>
              </Select>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {okMsg && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {okMsg}
            </p>
          )}

          <div className="flex justify-end border-t border-border pt-4">
            <Button
              type="submit"
              size="lg"
              className="h-9 px-8"
              disabled={!clienteId || !transferOrderId || !processDate || crear.isPending}
            >
              <Save className="size-5" />
              {crear.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
