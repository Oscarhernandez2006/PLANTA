import { ModulePage } from '@/components/layout/ModulePage';
import { OrdenDesposteIcon } from '@/components/icons/OrdenDesposteIcon';

export function OrdenDespostePage() {
  return (
    <ModulePage
      icon={OrdenDesposteIcon}
      title="Orden de Desposte"
      subtitle="Módulo en construcción. Aquí se registrarán las órdenes de desposte."
    >
      <div className="flex min-h-[280px] items-center justify-center px-6 py-12 text-center">
        <p className="max-w-lg text-sm text-muted-foreground">
          Las pantallas de administración seguirán el mismo bloque visual de
          encabezado, contenido y acciones institucionales.
        </p>
      </div>
    </ModulePage>
  );
}
