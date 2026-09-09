import { ModulePage } from '@/components/layout/ModulePage';
import { PielesIcon } from '@/components/icons/PielesIcon';

export function PielesPage() {
  return (
    <ModulePage
      icon={PielesIcon}
      title="Pieles"
      subtitle="Módulo en construcción. Aquí se registrará el manejo de pieles."
    >
      <div className="flex min-h-[280px] items-center justify-center px-6 py-12 text-center">
        <p className="max-w-lg text-sm text-muted-foreground">
          La estructura del módulo de pieles debe seguir el mismo patrón de
          cabecera, formulario y listado del resto de la planta.
        </p>
      </div>
    </ModulePage>
  );
}
