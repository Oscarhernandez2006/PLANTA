import { createContext, useContext, useEffect, useState } from 'react';
import { getLocalDeviceInfo } from '@/lib/device';

export interface DeviceContextValue {
  /** Nombre del PC (p. ej. DBOVINO3); su número final identifica la estación en el rotulado. */
  hostname: string | null;
  mac: string | null;
}

export const DeviceContext = createContext<DeviceContextValue>({
  hostname: null,
  mac: null,
});

export function useDevice() {
  return useContext(DeviceContext);
}

/**
 * Lee la información del equipo de forma informativa y sin bloquear: no hay
 * validación ni registro de estaciones, cualquier equipo con la app puede ingresar.
 */
export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<DeviceContextValue>({ hostname: null, mac: null });

  useEffect(() => {
    let activo = true;
    getLocalDeviceInfo()
      .then((info) => {
        if (activo) setValue({ hostname: info.hostname || null, mac: info.primaryMac ?? null });
      })
      .catch(() => {
        /* sin agente ni Electron: la estación queda sin nombre */
      });
    return () => {
      activo = false;
    };
  }, []);

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}
