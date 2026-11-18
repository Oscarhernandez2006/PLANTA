import { Activity, useEffect, useRef, useState, type ReactNode } from 'react';
import '@fontsource/montserrat/800.css';
import { Navigate, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { Home, LayoutGrid, LogOut, MonitorSmartphone, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import logoSantaCruz from '@/assets/logo-santacruz.png';
import { useAuth } from '@/features/auth/auth-context';
import { useDevice } from '@/features/device/device-context';
import { AvisoActualizacion, useActualizacion } from '@/components/update/ActualizacionApp';
import { tieneModulo, moduloDeRuta } from '@/lib/permisos';
import { ROL_LABEL } from '@/lib/roles';
import { MenuModulos, useModulosPermitidos } from './MenuModulos';

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { hostname } = useDevice();
  const location = useLocation();
  const navigate = useNavigate();
  const area = user ? (ROL_LABEL[user.role] ?? user.role) : '';
  const estacion = hostname ?? 'Estación sin nombre';
  const { estado: actualizacion, version: versionApp } = useActualizacion();

  const grupos = useModulosPermitidos();
  const modulos = grupos.flatMap((g) => g.items);
  const moduloActual = moduloDeRuta(location.pathname);
  const itemActual = modulos.find((i) => i.to === moduloActual) ?? null;
  const sinAcceso = !tieneModulo(user, moduloActual);
  const enInicio = location.pathname === '/';
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Módulos visitados: quedan montados pero ocultos (Activity) y conservan lo que se estaba digitando.
  // Ocultos no corren efectos, así que no escuchan teclado, báscula ni recargas.
  const outlet = useOutlet();
  const abiertos = useRef(new Map<string, ReactNode>());
  const [, refrescar] = useState(0);
  if (moduloActual && outlet && !sinAcceso) abiertos.current.set(moduloActual, outlet);

  // La casita vuelve al inicio y descarta lo que había en los módulos.
  const irAlInicio = () => {
    abiertos.current.clear();
    refrescar((n) => n + 1);
    navigate('/');
  };

  useEffect(() => {
    setMenuAbierto(false);
  }, [moduloActual]);

  useEffect(() => {
    if (!menuAbierto) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAbierto(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuAbierto]);

  // Quien solo tiene un módulo entra directo a él.
  if (enInicio && modulos.length === 1) return <Navigate to={modulos[0].to} replace />;

  const Icono = itemActual?.icon;
  const barraBtn =
    'flex h-11 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors hover:bg-accent active:bg-accent';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-20 shrink-0 items-center gap-2 border-b border-border bg-card px-3 text-foreground shadow-sm">
        <div className="mr-3 flex shrink-0 items-center gap-2.5">
          <div className="brillo-diamante shrink-0 rounded-full">
            <img src={logoSantaCruz} alt="Agropecuaria Santa Cruz" className="size-16 object-contain" />
          </div>
          <span className="texto-diamante font-['Montserrat'] text-[2rem] font-extrabold leading-none tracking-tight">
            SIGPRO
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMenuAbierto((v) => !v)}
          aria-expanded={menuAbierto}
          className={cn(barraBtn, 'border border-border', menuAbierto && 'bg-accent')}
        >
          {menuAbierto ? <X className="size-5" /> : <LayoutGrid className="size-5" />}
          {menuAbierto ? 'Cerrar' : 'Menú'}
        </button>
        <button
          type="button"
          onClick={irAlInicio}
          aria-label="Inicio"
          title="Inicio (limpia los módulos abiertos)"
          className={cn(barraBtn, 'w-11 justify-center px-0')}
        >
          <Home className="size-5" />
        </button>

        {Icono && (
          <div className="ml-2 flex min-w-0 items-center gap-2.5 border-l border-border pl-4">
            <Icono className="size-5 shrink-0 text-muted-foreground" />
            <span className="truncate text-lg font-semibold">{itemActual?.label}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden max-w-60 lg:block">
            <AvisoActualizacion estado={actualizacion} />
          </div>
          <div className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex" title="Equipo">
            <MonitorSmartphone className="size-3.5" />
            <span className="max-w-40 truncate">{estacion}</span>
            {versionApp && <span>· v{versionApp}</span>}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {user ? initials(user.fullName) : '—'}
            </div>
            <div className="hidden min-w-0 leading-tight md:block">
              <p className="max-w-48 truncate text-sm font-medium">{user?.fullName ?? 'Usuario'}</p>
              <p className="truncate text-xs text-muted-foreground">{area}</p>
            </div>
          </div>
          <button type="button" onClick={logout} className={cn(barraBtn, 'text-muted-foreground hover:text-foreground')}>
            <LogOut className="size-5" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 flex-col overflow-hidden">
        {menuAbierto && (
          <div className="absolute inset-0 z-40 bg-background px-4 py-5 sm:px-6">
            <MenuModulos actual={moduloActual} onElegir={(ruta) => (ruta === moduloActual ? setMenuAbierto(false) : navigate(ruta))} />
          </div>
        )}
        <main className="scrollbar-app flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto flex h-full w-full max-w-[1800px] flex-col">
            {/* Entrar por URL a un módulo sin permiso lleva al inicio. */}
            {sinAcceso ? (
              <Navigate to="/" replace />
            ) : (
              <>
                {!moduloActual && outlet}
                {[...abiertos.current].map(([ruta, contenido]) => (
                  <Activity key={ruta} mode={ruta === moduloActual ? 'visible' : 'hidden'}>
                    {contenido}
                  </Activity>
                ))}
              </>
            )}
          </div>
          {/* Espacio reservado cuando el teclado en pantalla está abierto. */}
          <div aria-hidden style={{ height: 'var(--osk-height, 0px)' }} />
        </main>
      </div>
    </div>
  );
}
