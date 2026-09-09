import { ModulePage } from '@/components/layout/ModulePage';
import { OrdenBeneficioIcon } from '@/components/icons/OrdenBeneficioIcon';

export function OrdenBeneficioPage() {
  return (
    <ModulePage
      icon={OrdenBeneficioIcon}
      title="Orden de Beneficio"
      subtitle="Módulo en construcción. Aquí se registrarán las órdenes de beneficio."
    >
      <div className="flex min-h-[280px] items-center justify-center px-6 py-12 text-center">
        <p className="max-w-lg text-sm text-muted-foreground">
          Esta vista debe mantener la misma estructura visual del resto de la
          aplicación para la administración y el manejo de ordenes.
        </p>
      </div>
    </ModulePage>
  );
}
