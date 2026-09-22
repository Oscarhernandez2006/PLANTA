import { useCallback, useEffect, useState } from 'react';
import {
  LoaderCircle,
  MonitorCheck,
  MonitorX,
  ShieldAlert,
  Beef,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getLocalDeviceInfo,
  isDesktop,
  validateDevice,
  type LocalDeviceInfo,
} from '@/lib/device';
import { DeviceContext } from './device-context';

type State = 'checking' | 'authorized' | 'blocked' | 'agent_missing' | 'error';

export function DeviceGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>('checking');
  const [info, setInfo] = useState<LocalDeviceInfo | null>(null);
  const [reason, setReason] = useState<'inactive' | 'unregistered' | null>(null);
  const [mac, setMac] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);

  const run = useCallback(async () => {
    setState('checking');
    let local: LocalDeviceInfo;
    try {
      local = await getLocalDeviceInfo();
      setInfo(local);
    } catch {
      setState('agent_missing');
      return;
    }
    try {
      const res = await validateDevice(local.macs, local.hostname);
      setMac(res.mac);
      if (res.authorized) {
        setDeviceName(res.deviceName ?? null);
        setState('authorized');
      } else {
        setReason(res.reason);
        setState('blocked');
      }
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  if (state === 'authorized')
    return (
      <DeviceContext.Provider
        value={{ deviceName, hostname: info?.hostname ?? null, mac }}
      >
        {children}
      </DeviceContext.Provider>
    );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-xl text-center">
        <div className="mb-8 flex justify-center">
          <div className="flex size-20 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Beef className="size-12" />
          </div>
        </div>

        {state === 'checking' && (
          <div className="flex flex-col items-center gap-4">
            <LoaderCircle className="size-14 animate-spin text-muted-foreground" />
            <p className="text-xl text-muted-foreground">
              Validando este equipo…
            </p>
          </div>
        )}

        {state === 'agent_missing' && (
          <Panel
            icon={<MonitorX className="size-12 text-amber-600" />}
            title="No se pudo leer el equipo"
            onRetry={run}
          >
            {isDesktop()
              ? 'No se pudo obtener la información del equipo. Reiniciá la aplicación e intentá de nuevo.'
              : 'No se pudo contactar el agente de este equipo. Verificá que el agente del Frigorífico esté instalado y en ejecución en este PC.'}
          </Panel>
        )}

        {state === 'blocked' && (
          <Panel
            icon={<ShieldAlert className="size-12 text-red-600" />}
            title="Equipo no autorizado"
            onRetry={run}
          >
            {reason === 'inactive'
              ? 'Este equipo está registrado pero se encuentra inactivo.'
              : 'Este equipo no está registrado en el sistema.'}
            {mac && (
              <span className="mt-3 block rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-lg text-foreground">
                {mac}
              </span>
            )}
            <span className="mt-2 block text-base text-muted-foreground">
              {info?.hostname && `Equipo: ${info.hostname} · `}
              Pasá esta MAC al administrador para habilitar el acceso.
            </span>
          </Panel>
        )}

        {state === 'error' && (
          <Panel
            icon={<MonitorCheck className="size-12 text-muted-foreground" />}
            title="No se pudo validar"
            onRetry={run}
          >
            Ocurrió un error validando el equipo. ¿Está disponible el servidor?
          </Panel>
        )}
      </div>
    </div>
  );
}

function Panel({
  icon,
  title,
  children,
  onRetry,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-10 shadow-sm">
      <div className="mb-6 flex justify-center">{icon}</div>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{children}</p>
      <Button className="mt-8 h-14 w-full text-lg" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
