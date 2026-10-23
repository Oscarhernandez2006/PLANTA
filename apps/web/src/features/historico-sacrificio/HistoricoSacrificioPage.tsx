import { Construction } from 'lucide-react';
import { Card } from '@/components/ui/card';

type IconType = React.ComponentType<{ className?: string }>;

/** Submódulo de Histórico Sacrificio (pendiente de definir su contenido). */
export function HistoricoSacrificioPage({
  titulo,
  icon: Icon,
}: {
  titulo: string;
  icon: IconType;
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <Icon className="size-9" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Histórico sacrificio — {titulo.toLowerCase()}.</p>
        </div>
      </div>

      <Card className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
        <Construction className="size-10" />
        <p className="text-base font-medium">Módulo en construcción</p>
        <p className="text-sm">Aquí se mostrará la información de {titulo}.</p>
      </Card>
    </div>
  );
}
