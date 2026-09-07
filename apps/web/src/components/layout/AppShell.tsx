import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LogOut, MonitorSmartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CanalFriaIcon } from '@/components/icons/CanalFriaIcon';
import { CanalCalienteIcon } from '@/components/icons/CanalCalienteIcon';
import { PesoEnCamionIcon } from '@/components/icons/PesoEnCamionIcon';
import { PesoEnPieIcon } from '@/components/icons/PesoEnPieIcon';
import { InsensibilizacionIcon } from '@/components/icons/InsensibilizacionIcon';
import { PielesIcon } from '@/components/icons/PielesIcon';
import { SubproductosIcon } from '@/components/icons/SubproductosIcon';
import { OrdenBeneficioIcon } from '@/components/icons/OrdenBeneficioIcon';
import { OrdenDespachoFrioIcon } from '@/components/icons/OrdenDespachoFrioIcon';
import { OrdenDesposteIcon } from '@/components/icons/OrdenDesposteIcon';
import logoSantaCruz from '@/assets/logo-santacruz.png';
import { useAuth } from '@/features/auth/auth-context';
import { useDevice } from '@/features/device/device-context';

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Módulos',
    items: [
      { to: '/peso-en-camion', label: 'Peso En Camión', icon: PesoEnCamionIcon },
      { to: '/peso-en-pie', label: 'Peso En Pie', icon: PesoEnPieIcon },
      { to: '/insensibilizacion', label: 'Insensibilización', icon: InsensibilizacionIcon },
      { to: '/pieles', label: 'Pieles', icon: PielesIcon },
      { to: '/subproductos', label: 'Subproductos', icon: SubproductosIcon },
      { to: '/canal-caliente', label: 'Canal Caliente', icon: CanalCalienteIcon },
      { to: '/canal-fria', label: 'Canal Fría', icon: CanalFriaIcon },
    ],
  },
  {
    title: 'Administrativo',
    items: [
      { to: '/orden-beneficio', label: 'Orden de Beneficio', icon: OrdenBeneficioIcon },
      { to: '/orden-despacho-frio', label: 'Orden de Despacho Frío', icon: OrdenDespachoFrioIcon },
      { to: '/orden-desposte', label: 'Orden de Desposte', icon: OrdenDesposteIcon },
    ],
  },
];

// Etiqueta de área a partir del rol (identificador) del usuario.
const areaLabels: Record<string, string> = {
  admin: 'Administración',
  supervisor_desposte: 'Supervisor desposte',
  operario_desposte: 'Desposte',
  despacho: 'Despacho',
  calidad: 'Calidad',
  desarrollador: 'Desarrollador',
};

const COLLAPSE_KEY = 'frigo_sidebar_collapsed';

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { deviceName, hostname } = useDevice();
  const area = user ? (areaLabels[user.role] ?? user.role) : '';
  const equipo = deviceName ?? hostname ?? 'Equipo sin nombre';

  // Recogido por defecto (pensado para pantallas táctiles POS).
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const v = localStorage.getItem(COLLAPSE_KEY);
    return v === null ? true : v === '1';
  });
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          'hidden shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex h-16 items-center border-b border-sidebar-border',
            collapsed ? 'justify-center px-2' : 'gap-2.5 px-4',
          )}
        >
          <img
            src={logoSantaCruz}
            alt="Agropecuaria Santa Cruz"
            className="size-9 shrink-0 object-contain"
          />
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-sm font-semibold">Agropecuaria Santa Cruz</p>
              <p className="text-xs text-sidebar-muted">Sistema de Planta</p>
            </div>
          )}
        </div>

        <nav className={cn('flex-1 space-y-1', collapsed ? 'p-2' : 'p-3')}>
          {navGroups.map((group, gi) => (
            <div
              key={group.title}
              className={cn(
                gi > 0 &&
                  (collapsed
                    ? 'mt-2 border-t border-sidebar-border pt-2'
                    : 'mt-1'),
              )}
            >
              {!collapsed && (
                <p className="px-3 pb-2 pt-3 text-xs font-medium uppercase tracking-wider text-sidebar-muted">
                  {group.title}
                </p>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  onDoubleClick={() => setCollapsed((c) => !c)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center rounded-md text-sm font-medium transition-colors',
                      collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2',
                      'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                      isActive && 'bg-sidebar-accent text-sidebar-foreground',
                    )
                  }
                >
                  <item.icon className={collapsed ? 'size-6' : 'size-5'} />
                  {!collapsed && item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div
          className={cn(
            'border-t border-sidebar-border',
            collapsed ? 'p-2' : 'space-y-2.5 p-4',
          )}
        >
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div
                title={user?.fullName}
                className="flex size-9 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold"
              >
                {user ? initials(user.fullName) : '—'}
              </div>
              <button
                onClick={logout}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                className="flex size-9 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold">
                  {user ? initials(user.fullName) : '—'}
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-medium">
                    {user?.fullName ?? 'Usuario'}
                  </p>
                  <p className="truncate text-xs text-sidebar-muted">
                    C.C. {user?.documentId ?? '—'}
                  </p>
                  <p className="truncate text-xs text-sidebar-muted">{area}</p>
                </div>
                <button
                  onClick={logout}
                  aria-label="Cerrar sesión"
                  className="flex size-9 shrink-0 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                >
                  <LogOut className="size-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-sidebar-accent/40 px-2.5 py-1.5">
                <MonitorSmartphone className="size-3.5 shrink-0 text-sidebar-muted" />
                <span className="truncate text-xs text-sidebar-muted">
                  {equipo}
                </span>
              </div>
            </>
          )}
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
          {/* Espacio reservado cuando el teclado en pantalla está abierto. */}
          <div aria-hidden style={{ height: 'var(--osk-height, 0px)' }} />
        </main>
      </div>
    </div>
  );
}
