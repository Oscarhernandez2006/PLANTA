import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { AppShell } from './components/layout/AppShell';
import { KeyboardProvider } from './components/keyboard/keyboard-context';
import { OnScreenKeyboard } from './components/keyboard/OnScreenKeyboard';
import { AuthProvider, useAuth } from './features/auth/auth-context';
import { LoginPage } from './features/auth/LoginPage';
import { WelcomeScreen } from './features/auth/WelcomeScreen';
import { DeviceGate } from './features/device/DeviceGate';
import { DevicesPage } from './features/device/DevicesPage';
import { CanalFriaPage } from './features/canal-fria/CanalFriaPage';
import { CanalCalientePage } from './features/canal-caliente/CanalCalientePage';
import { PesoEnCamionPage } from './features/peso-en-camion/PesoEnCamionPage';
import { PesoEnPiePage } from './features/peso-en-pie/PesoEnPiePage';
import { RotuladoPage } from './features/rotulado/RotuladoPage';
import { InsensibilizacionPage } from './features/insensibilizacion/InsensibilizacionPage';
import { PielesPage } from './features/pieles/PielesPage';
import { SubproductosPage } from './features/subproductos/SubproductosPage';
import { OrdenBeneficioPage } from './features/registrar/OrdenBeneficioPage';
import { OrdenDespachoFrioPage } from './features/registrar/OrdenDespachoFrioPage';
import { OrdenDespostePage } from './features/registrar/OrdenDespostePage';
import { DashboardPage } from './pages/DashboardPage';
import { GoodsReceiptsPage } from './features/goods-receipts/GoodsReceiptsPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'canal-fria', element: <CanalFriaPage /> },
      { path: 'canal-caliente', element: <CanalCalientePage /> },
      { path: 'peso-en-camion', element: <PesoEnCamionPage /> },
      { path: 'peso-en-pie', element: <PesoEnPiePage /> },
      {
        path: 'rotulado-desposte',
        element: <RotuladoPage stage="desposte" />,
      },
      {
        path: 'rotulado-acondicionamiento',
        element: <RotuladoPage stage="acondicionamiento" />,
      },
      { path: 'insensibilizacion', element: <InsensibilizacionPage /> },
      { path: 'pieles', element: <PielesPage /> },
      { path: 'subproductos', element: <SubproductosPage /> },
      { path: 'orden-beneficio', element: <OrdenBeneficioPage /> },
      { path: 'orden-despacho-frio', element: <OrdenDespachoFrioPage /> },
      { path: 'orden-desposte', element: <OrdenDespostePage /> },
      { path: 'ingresos', element: <GoodsReceiptsPage /> },
      { path: 'equipos', element: <DevicesPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <LoaderCircle className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function Gate() {
  const { user, loading, showWelcome, dismissWelcome } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <LoginPage />;
  if (showWelcome) return <WelcomeScreen onDone={dismissWelcome} />;
  return <RouterProvider router={router} />;
}

export function App() {
  return (
    <DeviceGate>
      <AuthProvider>
        <KeyboardProvider>
          <Gate />
          <OnScreenKeyboard />
        </KeyboardProvider>
      </AuthProvider>
    </DeviceGate>
  );
}
