import { useEffect, useState } from 'react';
import { Download, LoaderCircle, RotateCw } from 'lucide-react';
import type { UpdateState } from '@/lib/device';

/** Estado del actualizador de la app de escritorio (null en navegador o en desarrollo). */
export function useActualizacion() {
  const [estado, setEstado] = useState<UpdateState | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const puente = window.frigoDesktop;
    if (!puente?.getUpdateState) return;
    void puente.getUpdateState().then((s) => {
      setEstado(s);
      setVersion(s.appVersion ?? null);
    });
    return puente.onUpdateStatus?.((s) => setEstado(s));
  }, []);

  return { estado, version };
}

/** Aviso en el menú lateral cuando se está descargando o ya hay una versión nueva lista. */
export function AvisoActualizacion({ estado }: { estado: UpdateState | null }) {
  const [instalando, setInstalando] = useState(false);
  if (!estado) return null;

  if (estado.status === 'downloading') {
    return (
      <div className="flex items-center gap-2 rounded-md bg-sidebar-accent/40 px-2.5 py-1.5 text-xs text-sidebar-muted">
        <Download className="size-3.5 shrink-0" />
        <span className="truncate">
          Descargando versión {estado.version ?? ''}… {Math.round(estado.percent)}%
        </span>
      </div>
    );
  }

  if (estado.status === 'downloaded') {
    return (
      <button
        type="button"
        disabled={instalando}
        onClick={() => {
          setInstalando(true);
          void window.frigoDesktop?.installUpdate?.();
        }}
        title="Se instala la nueva versión y la aplicación se abre de nuevo"
        className="flex w-full items-center gap-2 rounded-md bg-emerald-600 px-2.5 py-2 text-left text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-70"
      >
        {instalando ? (
          <LoaderCircle className="size-4 shrink-0 animate-spin" />
        ) : (
          <RotateCw className="size-4 shrink-0" />
        )}
        <span>
          Versión {estado.version} lista.
          <span className="block font-normal opacity-90">Reiniciar y actualizar</span>
        </span>
      </button>
    );
  }

  return null;
}
