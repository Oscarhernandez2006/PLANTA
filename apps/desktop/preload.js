// Puente seguro entre el proceso nativo y el frontend (contextIsolation).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('frigoDesktop', {
  getDeviceInfo: () => ipcRenderer.invoke('device:get-info'),
  openKeyboard: () => ipcRenderer.invoke('keyboard:open'),
});
