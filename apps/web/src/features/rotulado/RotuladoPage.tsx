import { useMemo, useState } from 'react';
import { Printer, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { RotuladoDesposteIcon } from '@/components/icons/RotuladoDesposteIcon';
import { RotuladoAcondicionamientoIcon } from '@/components/icons/RotuladoAcondicionamientoIcon';
import { useOrdenes, type RotuladoOrden, type RotuladoStage } from './api';
import { OrdenesTab } from './tabs/OrdenesTab';
import { TiendasTab } from './tabs/TiendasTab';
import { ProductosTab } from './tabs/ProductosTab';
import { EmbalajeTab } from './tabs/EmbalajeTab';
import { ReporteTab } from './tabs/ReporteTab';
import { ReimpresionTab } from './tabs/ReimpresionTab';

function today() {
  return new Date().toISOString().slice(0, 10);
}

const META: Record<
  RotuladoStage,
  {
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    embalajeLabel: string;
  }
> = {
  desposte: {
    title: 'Rotulado Desposte',
    subtitle: 'Embalaje y rotulado de producto en sala de desposte.',
    icon: RotuladoDesposteIcon,
    embalajeLabel: 'Embalaje',
  },
  acondicionamiento: {
    title: 'Rotulado Acondicionamiento',
    subtitle: 'Rotulado de producto tras el acondicionamiento.',
    icon: RotuladoAcondicionamientoIcon,
    embalajeLabel: 'Rotulado',
  },
};

export function RotuladoPage({ stage }: { stage: RotuladoStage }) {
  const meta = META[stage];
  const Icon = meta.icon;

  const [fecha, setFecha] = useState(today());
  const [tab, setTab] = useState('ordenes');
  const [selectedOrden, setSelectedOrden] = useState<RotuladoOrden | null>(null);

  const ordenes = useOrdenes(stage, fecha);

  // Producto elegido en la pestaña PRODUCTOS que se lleva a EMBALAJE.
  const [productoSel, setProductoSel] = useState<{
    codigo: string | null;
    nombre: string;
  } | null>(null);

  const cliente = selectedOrden
    ? `${selectedOrden.clientNit} - ${selectedOrden.clientName}`
    : '—';

  const tabs: TabItem[] = useMemo(
    () => [
      { value: 'ordenes', label: 'Órdenes' },
      { value: 'tiendas', label: 'Tiendas' },
      { value: 'productos', label: 'Productos' },
      { value: 'embalaje', label: meta.embalajeLabel },
      { value: 'reporte', label: 'Reporte' },
      { value: 'reimpresion', label: 'Reimpresión' },
    ],
    [meta.embalajeLabel],
  );

  function selectOrden(o: RotuladoOrden | null) {
    setSelectedOrden(o);
  }

  return (
    <div className="space-y-6">
      {/* Encabezado + barra de acciones */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Icon className="size-9" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {meta.title}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {meta.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="size-9" title="Imprimir">
            <Printer className="size-5" />
          </Button>
          <Button variant="outline" size="icon" className="size-9" title="Bloquear">
            <Lock className="size-5" />
          </Button>
        </div>
      </div>

      {/* Fecha + cliente seleccionado */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="fecha">Fecha</Label>
            <Input
              id="fecha"
              type="date"
              className="h-9"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-medium">
              {cliente}
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Card className="overflow-hidden">
        <div className="px-4 pt-2">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
        </div>

        <div className="p-4">
          {tab === 'ordenes' && (
            <OrdenesTab
              loading={ordenes.isLoading}
              ordenes={ordenes.data ?? []}
              selected={selectedOrden}
              onSelect={selectOrden}
              stage={stage}
              fecha={fecha}
            />
          )}
          {tab === 'tiendas' && <TiendasTab orden={selectedOrden} />}
          {tab === 'productos' && (
            <ProductosTab
              onPick={(p) => {
                setProductoSel(p);
                setTab('embalaje');
              }}
            />
          )}
          {tab === 'embalaje' && (
            <EmbalajeTab
              stage={stage}
              orden={selectedOrden}
              productoSel={productoSel}
              embalajeLabel={meta.embalajeLabel}
            />
          )}
          {tab === 'reporte' && (
            <ReporteTab stage={stage} orden={selectedOrden} />
          )}
          {tab === 'reimpresion' && <ReimpresionTab />}
        </div>
      </Card>
    </div>
  );
}
