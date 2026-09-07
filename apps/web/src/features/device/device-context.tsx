import { createContext, useContext } from 'react';

export interface DeviceContextValue {
  deviceName: string | null;
  hostname: string | null;
  mac: string | null;
}

export const DeviceContext = createContext<DeviceContextValue>({
  deviceName: null,
  hostname: null,
  mac: null,
});

export function useDevice() {
  return useContext(DeviceContext);
}
