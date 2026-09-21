import { useEffect, useState } from 'react';
import { Plug, PlugZap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getSavedPrinterName,
  isDesktop,
  listPrinters,
  setSavedPrinterName,
  type PrinterInfo,
} from '@/lib/device';
import { cn } from '@/lib/utils';

/**
 * Panel de configuración de la impresora de presintos (Zebra ZD230 u otra):
 * elige, entre las impresoras instaladas en Windows, a cuál enviar el ZPL
 * directo (sin diálogos ni descargas). Solo funciona en la app de escritorio.
 */
export function PrinterConexion() {
  const [abierto, setAbierto] = useState(false);
  const [impresoras, setImpresoras] = useState<PrinterInfo[]>([]);
  const [seleccion, setSeleccion] = useState(getSavedPrinterName() ?? '');
  const [buscando, setBuscando] = useState(false);
  const desktop = isDesktop();

  async function buscarImpresoras() {
    setBuscando(true);
    const lista = await listPrinters();
    setImpresoras(lista);
    setBuscando(false);
    if (!seleccion) {
      const porDefecto = lista.find((p) => p.isDefault);
      if (porDefecto) guardarSeleccion(porDefecto.name);
    }
  }

  useEffect(() => {
    if (abierto && desktop && !impresoras.length) buscarImpresoras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  function guardarSeleccion(name: string) {
    setSeleccion(name);
    setSavedPrinterName(name || null);
  }

  const conectado = !!seleccion;

  return (
    <div className="border-b border-border bg-card px-5 py-3">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {conectado ? (
            <PlugZap className="size-4 text-emerald-600" />
          ) : (
            <Plug className="size-4 text-muted-foreground" />
          )}
          Impresora de presintos:{' '}
          <span
            className={cn(
              'font-semibold',
              conectado ? 'text-emerald-700' : 'text-muted-foreground',
            )}
          >
            {conectado ? seleccion : 'sin configurar (se descargará el .zpl)'}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {abierto ? 'Ocultar' : 'Configurar'}
        </span>
      </button>

      {abierto && (
        <div className="mt-3 space-y-3">
          {!desktop && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              La impresión directa solo está disponible en la app de
              escritorio. En el navegador, el presinto se descarga como .zpl.
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Impresora (Windows)
              <select
                value={seleccion}
                onChange={(e) => guardarSeleccion(e.target.value)}
                className="h-9 min-w-56 rounded-md border border-border bg-background px-2 text-sm"
                disabled={!desktop}
              >
                <option value="">Sin configurar (descargar .zpl)</option>
                {impresoras.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {p.isDefault ? ' (predeterminada)' : ''}
                  </option>
                ))}
                {seleccion && !impresoras.some((p) => p.name === seleccion) && (
                  <option value={seleccion}>{seleccion}</option>
                )}
              </select>
            </label>

            <Button
              variant="outline"
              size="sm"
              onClick={buscarImpresoras}
              disabled={buscando || !desktop}
            >
              <RefreshCw className={cn('size-4', buscando && 'animate-spin')} />
              Buscar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
