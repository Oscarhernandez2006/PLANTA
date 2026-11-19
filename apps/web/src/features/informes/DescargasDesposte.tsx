import { useState } from 'react';
import { FileSpreadsheet, LoaderCircle } from 'lucide-react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { descargarReporteDesposte, NOMBRE_REPORTE, type ReporteDesposte } from './desposte-reportes';

const REPORTES: ReporteDesposte[] = ['consolidado', 'detalle', 'cliente-tienda'];

export function DescargasDesposte({ opNumber }: { opNumber: number }) {
  const [activo, setActivo] = useState<ReporteDesposte | null>(null);
  const [error, setError] = useState('');
  async function descargar(tipo: ReporteDesposte) {
    setActivo(tipo);
    setError('');
    try {
      await descargarReporteDesposte(opNumber, tipo);
    } catch (err) {
      setError(!axios.isAxiosError(err) && err instanceof Error
        ? err.message : 'No se pudo descargar el reporte de desposte. Intenta de nuevo.');
    } finally {
      setActivo(null);
    }
  }
  return (
    <div className="space-y-2 py-2">
      <p className="text-xs font-semibold text-muted-foreground">Reportes Excel de toda la orden</p>
      <div className="flex flex-wrap gap-2">
        {REPORTES.map((tipo) => (
          <Button key={tipo} type="button" size="sm" variant="outline" disabled={activo !== null} onClick={() => void descargar(tipo)}>
            {activo === tipo ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4 text-primary" />}
            {NOMBRE_REPORTE[tipo]}
          </Button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
