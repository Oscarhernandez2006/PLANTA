import { useState } from 'react';
import { Search, Eraser, Printer, LoaderCircle } from 'lucide-react';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchEtiquetaByBarcode, type RotuladoEtiqueta } from '../api';

function kg(n: number | null) {
  return (n ?? 0).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const CONSERVACION_LABEL: Record<string, string> = {
  refrigerado: 'REFRIGERADO',
  congelado: 'CONGELADO',
};

export function ReimpresionTab() {
  const [barcode, setBarcode] = useState('');
  const [etiqueta, setEtiqueta] = useState<RotuladoEtiqueta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar() {
    const code = barcode.trim();
    if (!code) return;
    setLoading(true);
    setError(null);
    try {
      const found = await fetchEtiquetaByBarcode(code);
      setEtiqueta(found);
    } catch {
      setEtiqueta(null);
      setError('No se encontró una etiqueta con ese código.');
    } finally {
      setLoading(false);
    }
  }

  function limpiar() {
    setBarcode('');
    setEtiqueta(null);
    setError(null);
  }

  return (
    <div className="space-y-4">
      {/* Buscador */}
      <div className="space-y-1.5">
        <Label>Código de Barras de Etiqueta</Label>
        <div className="flex gap-2">
          <Input
            className="h-11"
            placeholder="Escaneá o escribí el código…"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
          />
          <Button className="h-11 px-4" onClick={buscar} disabled={loading}>
            {loading ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <Search className="size-5" />
            )}
          </Button>
          <Button variant="outline" className="h-11 px-4" onClick={limpiar}>
            <Eraser className="size-5" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Detalles */}
        <div className="rounded-lg border border-border p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Detalles
          </p>
          {etiqueta ? (
            <dl className="space-y-1.5 text-sm">
              <Row k="Producto" v={etiqueta.producto ?? '—'} />
              <Row k="Código" v={etiqueta.codigoProducto ?? '—'} />
              <Row k="Tienda" v={etiqueta.tienda ?? '—'} />
              <Row k="Empaque" v={etiqueta.empaque ?? '—'} />
              <Row k="Ref." v={etiqueta.ref ?? '—'} />
              <Row k="Bruto (kg)" v={kg(etiqueta.bruto)} />
              <Row k="Tara (kg)" v={kg(etiqueta.tara)} />
              <Row k="Neto (kg)" v={kg(etiqueta.neto)} />
            </dl>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Buscá una etiqueta para ver sus detalles.
            </p>
          )}
        </div>

        {/* Vista de la etiqueta */}
        <div className="rounded-lg border border-border p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vista
          </p>
          {etiqueta ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 font-mono text-xs leading-relaxed">
              <div className="grid grid-cols-4 gap-1 font-semibold">
                <span>LOTE</span>
                <span>REF.</span>
                <span>ORIGEN</span>
                <span className="text-right">PIEZAS</span>
              </div>
              <div className="border-y border-dashed border-border/60 py-1">
                <div className="grid grid-cols-3 gap-1 font-semibold">
                  <span>BRUTO(kg)</span>
                  <span className="text-center">TARA(kg)</span>
                  <span className="text-right">NETO(kg)</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span>{kg(etiqueta.bruto)}</span>
                  <span className="text-center">{kg(etiqueta.tara)}</span>
                  <span className="text-right">{kg(etiqueta.neto)}</span>
                </div>
              </div>
              <div className="pt-1">
                <p>FEC. DE SACRIFICIO: {etiqueta.fechaSacrificio ?? '—'}</p>
                <p>FEC. DE EMPAQUE: {etiqueta.fechaEmpaque ?? '—'}</p>
                <p>FEC. DE VENCIMIENTO: {etiqueta.fechaVencimiento ?? '—'}</p>
                <p>
                  CONSERVACIÓN:{' '}
                  {CONSERVACION_LABEL[etiqueta.conservacion] ?? '—'}
                </p>
                <p className="mt-2 text-center tracking-widest">
                  {etiqueta.barcode}
                </p>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              La vista previa de la etiqueta aparecerá acá.
            </p>
          )}

          <Button
            className="mt-4 h-11 w-full"
            disabled={!etiqueta}
            title="Reimprimir etiqueta"
          >
            <Printer className="size-5" />
            Reimprimir
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-1">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
