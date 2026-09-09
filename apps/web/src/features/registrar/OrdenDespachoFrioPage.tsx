import { ModulePage } from '@/components/layout/ModulePage';
import { OrdenDespachoFrioIcon } from '@/components/icons/OrdenDespachoFrioIcon';

export function OrdenDespachoFrioPage() {
  return (
    <ModulePage
      icon={OrdenDespachoFrioIcon}
      title="Orden de Despacho Frío"
      subtitle="Módulo en construcción. Aquí se registrarán las órdenes de despacho frío."
    >
      <div className="flex min-h-[280px] items-center justify-center px-6 py-12 text-center">
        <p className="max-w-lg text-sm text-muted-foreground">
          El patrón de diseño será uniforme en todas las pantallas
          administrativas para mantener una misma experiencia de operación.
        </p>
      </div>
    </ModulePage>
  );
}
