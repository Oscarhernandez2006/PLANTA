import { CanalReciboIcon } from '@/components/icons/CanalReciboIcon';
import { RegistroReciboTab } from './RegistroReciboTab';

export function CanalReciboPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CanalReciboIcon className="size-9" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orden recibo de canales</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Registro de órdenes de recibo de canales.
          </p>
        </div>
      </div>

      <RegistroReciboTab />
    </div>
  );
}
