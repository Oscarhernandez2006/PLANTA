import axios from 'axios';

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

const configuredApiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const isFileProtocol =
  typeof window !== 'undefined' && window.location.protocol === 'file:';

/** Cliente HTTP base. En dev, Vite proxya /api -> http://localhost:3000. */
export const api = axios.create({
  // El puente Electron también existe en desarrollo; solo file:// carece del
  // proxy de Vite y necesita apuntar directamente al backend.
  baseURL:
    configuredApiBase ||
    (isFileProtocol ? 'http://127.0.0.1:3000/api' : '/api'),
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const url: string | undefined = error?.config?.url;
    // Cierra sesión ante 401, salvo en endpoints de credenciales puntuales
    // (login y verificación de administrador), que manejan su propio error.
    const isCredentialCheck =
      url === '/auth/login' || url === '/auth/verify-admin';
    if (status === 401 && !isCredentialCheck && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(error);
  },
);

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(cb: (() => void) | null) {
  onUnauthorized = cb;
}
