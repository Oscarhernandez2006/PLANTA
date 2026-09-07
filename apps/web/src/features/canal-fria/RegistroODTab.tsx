import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Input, Label, Select } from '@/components/ui/input';
import { useKeyboard } from '@/components/keyboard/keyboard-context';
import {
  useClients,
  useCreateDispatchOrder,
  useNextOdNumber,
  type DispatchOrderStatus,
} from './api';

function today() {
  return new Date().toISOString().slice(0, 10);
}
function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function RegistroODTab({ onCreated }: { onCreated: () => void }) {
  const clients = useClients();
  const next = useNextOdNumber();
  const create = useCreateDispatchOrder();
  const keyboard = useKeyboard();

  const [clientId, setClientId] = useState('');
  const [registrationDate, setRegistrationDate] = useState(today());
  const [processDate, setProcessDate] = useState(tomorrow());
  const [status, setStatus] = useState<DispatchOrderStatus>('activo');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const clientOptions = useMemo(
    () =>
      (clients.data ?? []).map((c) => ({
        value: c.id,
        label: `${c.nit} - ${c.name} (${c.sede})`,
      })),
    [clients.data],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    if (!clientId) return setError('Seleccioná un cliente.');
    try {
      const created = await create.mutateAsync({
        clientId,
        registrationDate,
        processDate,
        status,
      });
      setOkMsg(`Orden O.D. ${created.odNumber} registrada.`);
      setClientId('');
      setRegistrationDate(today());
      setProcessDate(tomorrow());
      setStatus('activo');
      void next.refetch();
      onCreated();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? 'No se pudo registrar la orden.';
      setError(Array.isArray(message) ? message.join(' · ') : message);
    }
  }

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle>Registrar orden de despacho</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              O.D. N.º
            </Label>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-primary">
              {next.data ? next.data.next : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              Se asigna automáticamente al guardar.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reg">Fecha de registro</Label>
              <Input
                id="reg"
                type="date"
                className="h-11"
                value={registrationDate}
                disabled
                title="La fecha de registro es la del día y no se puede modificar."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proc">Fecha de proceso</Label>
              <Input
                id="proc"
                type="date"
                className="h-11"
                value={processDate}
                onChange={(e) => setProcessDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client">Cliente (Sede)</Label>
            <Combobox
              id="client"
              options={clientOptions}
              value={clientId}
              onChange={setClientId}
              placeholder="Buscar cliente por NIT o nombre…"
              onKeyboard={keyboard.open}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status">Estado</Label>
            <Select
              id="status"
              className="h-11 sm:max-w-xs"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as DispatchOrderStatus)
              }
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
              className="h-12 px-8"
              disabled={create.isPending}
            >
              <Save className="size-5" />
              {create.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
