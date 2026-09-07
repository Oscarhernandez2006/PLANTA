import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, setAuthToken, setUnauthorizedHandler } from '@/lib/api';

export interface AuthUser {
  id: string;
  fullName: string;
  documentId: string | null;
  role: string;
  plant?: { id: string; code: string; legalName: string };
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  showWelcome: boolean;
  checkCedula: (
    documentId: string,
  ) => Promise<{ exists: boolean; fullName: string | null }>;
  login: (documentId: string, pin: string) => Promise<void>;
  logout: () => void;
  dismissWelcome: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_KEY = 'frigo_token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
    setShowWelcome(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Restaura la sesión al cargar validando el token contra /auth/me.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    setAuthToken(token);
    api
      .get<AuthUser>('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const login = useCallback(async (documentId: string, pin: string) => {
    const { data } = await api.post<{ accessToken: string; user: AuthUser }>(
      '/auth/login',
      { documentId, pin },
    );
    localStorage.setItem(TOKEN_KEY, data.accessToken);
    setAuthToken(data.accessToken);
    setUser(data.user);
    // Sólo en login explícito; no al restaurar sesión con /auth/me.
    setShowWelcome(true);
  }, []);

  const checkCedula = useCallback(async (documentId: string) => {
    const { data } = await api.post<{
      exists: boolean;
      fullName: string | null;
    }>('/auth/check-cedula', { documentId });
    return data;
  }, []);

  const dismissWelcome = useCallback(() => setShowWelcome(false), []);

  const value = useMemo(
    () => ({
      user,
      loading,
      showWelcome,
      checkCedula,
      login,
      logout,
      dismissWelcome,
    }),
    [user, loading, showWelcome, checkCedula, login, logout, dismissWelcome],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
