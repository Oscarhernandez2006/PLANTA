import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Input, Label, Select } from '@/components/ui/input';
import { OrdenDespachoFrioIcon } from '@/components/icons/OrdenDespachoFrioIcon';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import { plantToday as today } from '@/lib/utils';
import {
  formatOD,
  useClientesActivos,
  useCreateOrdenDespacho,
  useOrdenDespachoNextNumber,
  type OrdenDespachoStatus,
} from './orden-despacho-api';

/** Día siguiente a `iso` (YYYY-MM-DD). */
function manana(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function OrdenDespachoPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <OrdenDespachoFrioIcon className="size-9 text-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orden de Despacho</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Registra una orden de despacho para un cliente.
          </p>
        </div>
      </div>
      <RegistrarOrdenDespachoForm />
    </div>
  );
}

function RegistrarOrdenDespachoForm() {
  const hoy = today();
  const keyboard = useKeyboard();
  const next = useOrdenDespachoNextNumber();
  const crear = useCreateOrdenDespacho();
  const clientes = useClientesActivos();

  const [processDate, setProcessDate] = useState(manana(hoy));
  const [clienteId, setClienteId] = useState('');
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

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    if (!clienteId) return setError('Selecciona el cliente.');
    if (!processDate) return setError('Selecciona la fecha de proceso.');
    try {
      const created = await crear.mutateAsync({
        clienteId,
        registrationDate: hoy,
        processDate,
        status,
      });
      setOkMsg(`Orden de despacho ${formatOD(created.odNumber)} registrada.`);
      void next.refetch();
      setProcessDate(manana(hoy));
      setClienteId('');
      setStatus('activo');
    } catch (err) {
      const detail = (
        err as { response?: { data?: { message?: string | string[] } } }
      ).response?.data?.message;
      setError(
        Array.isArray(detail)
          ? detail.join(' ')
          : detail || 'No se pudo registrar la orden de despacho.',
      );
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Registrar orden de despacho</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={guardar} className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              OD N.º
            </Label>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-primary">
              {next.data ? formatOD(next.data.next) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              Se asigna automáticamente al guardar.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="od-fec-registro">Fecha de registro</Label>
              <Input
                id="od-fec-registro"
                type="date"
                className="h-9"
                value={hoy}
                disabled
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="od-fec-proceso">Fecha de proceso</Label>
              <Input
                id="od-fec-proceso"
                type="date"
                className="h-9"
                value={processDate}
                min={hoy}
                onChange={(e) => setProcessDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="od-cliente">Cliente</Label>
            <Combobox
              id="od-cliente"
              className="h-9"
              options={clienteOptions}
              value={clienteId}
              onChange={setClienteId}
              placeholder={clientes.isLoading ? 'Cargando…' : 'Buscar cliente por NIT o nombre…'}
              emptyText="Sin clientes activos"
              onKeyboard={keyboard.open}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="od-estado">Estado</Label>
            <Select
              id="od-estado"
              className="h-9 sm:max-w-xs"
              value={status}
              onChange={(e) => setStatus(e.target.value as OrdenDespachoStatus)}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
              <option value="facturado">Facturado</option>
            </Select>
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
              disabled={!clienteId || !processDate || crear.isPending}
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
