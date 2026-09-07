import { useState } from 'react';
import {
  MonitorSmartphone,
  Plus,
  Power,
  Trash2,
  Laptop,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { getLocalDeviceInfo } from '@/lib/device';
import {
  useCreateDevice,
  useDeleteDevice,
  useDevices,
  useUpdateDevice,
} from './api';

export function DevicesPage() {
  const { data, isLoading, isError } = useDevices();
  const update = useUpdateDevice();
  const del = useDeleteDevice();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ mac: string; name: string } | null>(
    null,
  );

  async function addThisDevice() {
    try {
      const info = await getLocalDeviceInfo();
      setPrefill({ mac: info.primaryMac ?? '', name: info.hostname });
    } catch {
      setPrefill({ mac: '', name: '' });
    }
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Equipos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            PCs autorizados a acceder al sistema. El acceso se valida por la MAC
            que reporta el agente local de cada equipo.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addThisDevice}>
            <Laptop /> Agregar este equipo
          </Button>
          <Button
            onClick={() => {
              setPrefill(null);
              setDialogOpen(true);
            }}
          >
            <Plus /> Agregar equipo
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Equipo</TH>
              <TH>MAC</TH>
              <TH>Estado</TH>
              <TH>Últref. visto</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TR key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TD key={j}>
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </TD>
                  ))}
                </TR>
              ))}

            {isError && (
              <TR>
                <TD colSpan={5} className="py-10 text-center text-sm text-red-600">
                  Error al cargar los equipos.
                </TD>
              </TR>
            )}

            {data && data.length === 0 && (
              <TR>
                <TD colSpan={5}>
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <MonitorSmartphone className="size-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium">Sin equipos registrados</p>
                    <p className="text-sm text-muted-foreground">
                      Mientras no haya equipos, el acceso está abierto. Registrá
                      este PC para empezar a restringir.
                    </p>
                  </div>
                </TD>
              </TR>
            )}

            {data?.map((d) => (
              <TR key={d.id}>
                <TD>
                  <div className="font-medium">{d.name}</div>
                  {d.hostname && (
                    <div className="text-xs text-muted-foreground">
                      {d.hostname}
                    </div>
                  )}
                </TD>
                <TD className="font-mono text-sm">{d.mac}</TD>
                <TD>
                  <Badge tone={d.active ? 'success' : 'danger'}>
                    {d.active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </TD>
                <TD className="text-muted-foreground">
                  {d.lastSeenAt ? formatDateTime(d.lastSeenAt) : '—'}
                </TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({ id: d.id, active: !d.active })
                      }
                    >
                      <Power className="size-4" />
                      {d.active ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={del.isPending}
                      aria-label="Eliminar"
                      onClick={() => {
                        if (confirm(`¿Eliminar el equipo "${d.name}"?`))
                          del.mutate(d.id);
                      }}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <CreateDeviceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        prefill={prefill}
      />
    </div>
  );
}

function CreateDeviceDialog({
  open,
  onClose,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  prefill: { mac: string; name: string } | null;
}) {
  const create = useCreateDevice();
  const [mac, setMac] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Sincroniza los campos cuando cambia el prefill / se abre el diálogo.
  const [lastPrefill, setLastPrefill] = useState<typeof prefill>(null);
  if (open && prefill !== lastPrefill) {
    setLastPrefill(prefill);
    setMac(prefill?.mac ?? '');
    setName(prefill?.name ?? '');
    setDescription('');
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        mac: mac.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onClose();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? 'No se pudo registrar el equipo.';
      setError(Array.isArray(message) ? message.join(' · ') : message);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Registrar equipo"
      description="La MAC la reporta el agente local del PC. Podés usar “Agregar este equipo” para autocompletarla."
      className="max-w-lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="mac">Dirección MAC</Label>
          <Input
            id="mac"
            value={mac}
            onChange={(e) => setMac(e.target.value)}
            placeholder="AA:BB:CC:DD:EE:FF"
            className="font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre del equipo</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Terminal desposte 1"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="desc">Descripción (opcional)</Label>
          <Input
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ubicación / área"
          />
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Guardando…' : 'Registrar equipo'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
