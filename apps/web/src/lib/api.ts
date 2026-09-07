import axios from 'axios';

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Cliente HTTP base. En dev, Vite proxya /api -> http://localhost:3000. */
export const api = axios.create({
  baseURL: '/api',
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
    // Cierra sesión ante 401, salvo en el propio login (credenciales inválidas).
    if (status === 401 && url !== '/auth/login' && onUnauthorized) {
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
