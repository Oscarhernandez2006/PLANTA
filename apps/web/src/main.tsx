import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { instalarMayusculas } from './lib/mayusculas';
import { instalarArregloFocoDialogos, sincronizarConfigEstacion } from './lib/device';
import './index.css';

instalarMayusculas();
instalarArregloFocoDialogos();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

// Carga la impresora y la báscula fijadas en el equipo antes de pintar la app.
void sincronizarConfigEstacion().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
});
