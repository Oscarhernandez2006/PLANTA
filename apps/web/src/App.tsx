import {
  createBrowserRouter,
  createHashRouter,
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
import { CanalReciboPage } from './features/canal-recibo/CanalReciboPage';
import { PostaReciboPage } from './features/recibo-posta/PostaReciboPage';
import { CanalCalientePage } from './features/canal-caliente/CanalCalientePage';
import { InventariosPage } from './features/inventarios/InventariosPage';
import { PesoEnCamionPage } from './features/peso-en-camion/PesoEnCamionPage';
import { PesoEnPiePage } from './features/peso-en-pie/PesoEnPiePage';
import { ReciboCanalesPage } from './features/recibo-canales/ReciboCanalesPage';
import { ReciboEnPostaPage } from './features/recibo-en-posta/ReciboEnPostaPage';
import { RotuladoDespostePage } from './features/rotulado/RotuladoDespostePage';
import { RotuladoAcondicionamientoPage } from './features/rotulado/RotuladoAcondicionamientoPage';
import { SacrificioPage } from './features/sacrificio/SacrificioPage';
import { PielesPage } from './features/pieles/PielesPage';
import { SubproductosPage } from './features/subproductos/SubproductosPage';
import { OrdenBeneficioPage } from './features/registrar/OrdenBeneficioPage';
import { OrdenDespachoPage } from './features/registrar/OrdenDespachoPage';
import { DespachoCanalesPage } from './features/registrar/DespachoCanalesPage';
import { DespachoLogisticaPage } from './features/logistica/DespachoLogisticaPage';
import { OrdenTrasladoPage } from './features/registrar/OrdenTrasladoPage';
import { OrdenAcondicionamientoPage } from './features/registrar/OrdenAcondicionamientoPage';
import { TrasladoPage } from './features/traslado/TrasladoPage';
import { OrdenProduccionPage } from './features/registrar/OrdenProduccionPage';
import { ProductosPage } from './features/products/ProductosPage';
import { ClientesPage } from './features/clientes/ClientesPage';
import { ConservacionPage } from './features/conservacion/ConservacionPage';
import { PiezasDespostePage } from './features/piezas-desposte/PiezasDespostePage';
import { InformesPage } from './features/informes/InformesPage';
import { DashboardPage } from './pages/DashboardPage';
import { GoodsReceiptsPage } from './features/goods-receipts/GoodsReceiptsPage';

// La app de escritorio empaquetada carga index.html desde file://, donde las
// rutas del navegador no funcionan; ahí se usa enrutado por hash (#/ruta).
const createRouter =
  window.location.protocol === 'file:' ? createHashRouter : createBrowserRouter;

const router = createRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'canal-fria', element: <CanalFriaPage /> },
      { path: 'recibo-canal', element: <CanalReciboPage /> },
      { path: 'recibo-posta', element: <PostaReciboPage /> },
      { path: 'canal-caliente', element: <CanalCalientePage /> },
      { path: 'inventarios', element: <InventariosPage /> },
      { path: 'peso-en-camion', element: <PesoEnCamionPage /> },
      { path: 'peso-en-pie', element: <PesoEnPiePage /> },
      { path: 'recibo-de-canales', element: <ReciboCanalesPage /> },
      { path: 'recibo-en-posta', element: <ReciboEnPostaPage /> },
      {
        path: 'rotulado-desposte',
        element: <RotuladoDespostePage />,
      },
      {
        path: 'rotulado-acondicionamiento',
        element: <RotuladoAcondicionamientoPage />,
      },
      { path: 'sacrificio', element: <SacrificioPage /> },
      { path: 'pieles', element: <PielesPage /> },
      { path: 'subproductos', element: <SubproductosPage /> },
      { path: 'orden-beneficio', element: <OrdenBeneficioPage /> },
      { path: 'orden-despacho', element: <OrdenDespachoPage /> },
      { path: 'despacho-canales', element: <DespachoCanalesPage /> },
      { path: 'despacho-caliente', element: <DespachoLogisticaPage key="caliente" tipo="caliente" /> },
      { path: 'despacho-frio', element: <DespachoLogisticaPage key="frio" tipo="frio" /> },
      { path: 'despacho-posta', element: <DespachoLogisticaPage key="posta" tipo="posta" /> },
      { path: 'orden-traslado', element: <OrdenTrasladoPage /> },
      { path: 'traslado', element: <TrasladoPage /> },
      { path: 'orden-produccion', element: <OrdenProduccionPage /> },
      { path: 'orden-acondicionamiento', element: <OrdenAcondicionamientoPage /> },
      { path: 'productos', element: <ProductosPage /> },
      { path: 'clientes', element: <ClientesPage /> },
      { path: 'conservacion', element: <ConservacionPage /> },
      { path: 'piezas-desposte', element: <PiezasDespostePage /> },
      { path: 'informes', element: <InformesPage /> },
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
