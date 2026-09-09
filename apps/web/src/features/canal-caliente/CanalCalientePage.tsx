import { ModulePage } from '@/components/layout/ModulePage';
import { CanalCalienteIcon } from '@/components/icons/CanalCalienteIcon';

export function CanalCalientePage() {
  return (
    <ModulePage
      icon={CanalCalienteIcon}
      title="Canal Caliente"
      subtitle="Módulo en construcción. Aquí se registrará el canal en caliente."
    >
      <div className="flex min-h-[280px] items-center justify-center px-6 py-12 text-center">
        <p className="max-w-lg text-sm text-muted-foreground">
          El flujo de canal caliente se integrará con la misma estructura de
          registro, KPI y listado que el resto de módulos.
        </p>
      </div>
    </ModulePage>
  );
}
