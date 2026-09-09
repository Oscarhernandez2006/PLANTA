import { ModulePage } from '@/components/layout/ModulePage';
import { SubproductosIcon } from '@/components/icons/SubproductosIcon';

export function SubproductosPage() {
  return (
    <ModulePage
      icon={SubproductosIcon}
      title="Subproductos"
      subtitle="Módulo en construcción. Aquí se registrará el manejo de subproductos."
    >
      <div className="flex min-h-[280px] items-center justify-center px-6 py-12 text-center">
        <p className="max-w-lg text-sm text-muted-foreground">
          El módulo de subproductos conservará el mismo estándar visual y de
          flujo que los demás módulos del sistema.
        </p>
      </div>
    </ModulePage>
  );
}
