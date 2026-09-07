import { useState } from 'react';
import { CanalFriaIcon } from '@/components/icons/CanalFriaIcon';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import type { DispatchOrder } from './api';
import { RegistroODTab } from './RegistroODTab';
import { OrdenesDespachoTab } from './OrdenesDespachoTab';
import { RegistroTab } from './RegistroTab';

const tabs: TabItem[] = [
  { value: 'registro-od', label: 'Registro O.D.' },
  { value: 'ordenes', label: 'Órdenes de Despacho' },
  { value: 'registro', label: 'Registro' },
  { value: 'totales', label: 'Totales' },
];

export function CanalFriaPage() {
  const [tab, setTab] = useState('registro-od');
  const [selectedOrder, setSelectedOrder] = useState<DispatchOrder | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CanalFriaIcon className="size-9" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Canal Fría</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Órdenes de despacho — traslado de canales a desposte.
          </p>
        </div>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <div>
        {tab === 'registro-od' && (
          <RegistroODTab onCreated={() => setTab('ordenes')} />
        )}
        {tab === 'ordenes' && (
          <OrdenesDespachoTab
            onSelect={(o) => {
              setSelectedOrder(o);
              setTab('registro');
            }}
          />
        )}
        {tab === 'registro' && (
          <RegistroTab
            order={selectedOrder}
            onGoToOrders={() => setTab('ordenes')}
          />
        )}
        {tab === 'totales' && <Placeholder title="Totales" />}
      </div>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border py-16 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">Por definir.</p>
    </div>
  );
}
