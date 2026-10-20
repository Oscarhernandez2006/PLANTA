import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, MonitorSmartphone, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import logoSantaCruz from '@/assets/logo-santacruz.png';
import { useAuth } from '@/features/auth/auth-context';
import { useDevice } from '@/features/device/device-context';
import { AvisoActualizacion, useActualizacion } from '@/components/update/ActualizacionApp';
import { navGroups as todosLosGrupos, type NavItem } from './nav-config';
import { tieneModulo, moduloDeRuta } from '@/lib/permisos';
import { ROL_LABEL } from '@/lib/roles';

const COLLAPSE_KEY = 'frigo_sidebar_collapsed';
const OPEN_GROUPS_KEY = 'frigo_sidebar_open_groups';

function groupHasActiveRoute(group: { items: NavItem[] }, pathname: string) {
  return group.items.some((item) => pathname.startsWith(item.to));
}

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
  const location = useLocation();
  const area = user ? (ROL_LABEL[user.role] ?? user.role) : '';
  const estacion = deviceName ?? hostname ?? 'Estación sin nombre';
  const { estado: actualizacion, version: versionApp } = useActualizacion();

  // Solo los módulos que el usuario tiene permitidos (los grupos vacíos no se muestran).
  const navGroups = todosLosGrupos
    .map((g) => ({ ...g, items: g.items.filter((i) => tieneModulo(user, i.to)) }))
    .filter((g) => g.items.length > 0);
  const moduloActual = moduloDeRuta(location.pathname);
  const sinAcceso = !tieneModulo(user, moduloActual);

  // Recogido por defecto (pensado para pantallas táctiles POS).
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const v = localStorage.getItem(COLLAPSE_KEY);
    return v === null ? true : v === '1';
  });
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Menú en acordeón: solo un grupo abierto a la vez. Al entrar queda abierto
  // únicamente el grupo del módulo actual; abrir otro cierra el anterior.
  const [openGroup, setOpenGroup] = useState<string | null>(
    () => navGroups.find((g) => groupHasActiveRoute(g, location.pathname))?.title ?? null,
  );
  useEffect(() => {
    // Limpia el estado de la versión anterior, que dejaba varios grupos abiertos.
    localStorage.removeItem(OPEN_GROUPS_KEY);
  }, []);

  // Al navegar a un módulo se abre su grupo y se cierran los demás.
  useEffect(() => {
    const activeGroup = navGroups.find((group) =>
      groupHasActiveRoute(group, location.pathname),
    );
    if (activeGroup) setOpenGroup(activeGroup.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleGroup = (title: string) => {
    setOpenGroup((actual) => (actual === title ? null : title));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          'hidden shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex h-16 shrink-0 items-center border-b border-sidebar-border',
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

        <nav
          className={cn(
            'min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain [scrollbar-color:rgb(255_255_255/0.25)_transparent] [scrollbar-width:thin]',
            collapsed ? 'p-2' : 'p-3',
          )}
        >
          {navGroups.map((group, gi) => {
            // Grupos sin título (ítems "sueltos" aún sin categoría) no son
            // desplegables: siempre se muestran, sin botón de acordeón.
            const isOpen =
              collapsed || !group.title || openGroup === group.title;
            return (
              <div
                key={group.title || 'sin-grupo'}
                className={cn(
                  gi > 0 &&
                    (collapsed
                      ? 'mt-2 border-t border-sidebar-border pt-2'
                      : 'mt-1'),
                )}
              >
                {!collapsed && group.title && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.title)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between rounded-md px-3 pb-2 pt-3 text-xs font-medium uppercase tracking-wider text-sidebar-muted transition-colors hover:text-sidebar-foreground"
                  >
                    <span>{group.title}</span>
                    <ChevronDown
                      className={cn(
                        'size-3.5 shrink-0 transition-transform duration-200',
                        !isOpen && '-rotate-90',
                      )}
                    />
                  </button>
                )}
                {isOpen &&
                  group.items.map((item) => (
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
            );
          })}
        </nav>

        <div
          className={cn(
            'shrink-0 border-t border-sidebar-border',
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
                  {estacion}
                </span>
                {versionApp && (
                  <span className="ml-auto shrink-0 text-[10px] text-sidebar-muted/80">v{versionApp}</span>
                )}
              </div>
              <AvisoActualizacion estado={actualizacion} />
            </>
          )}
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto flex h-full w-full max-w-7xl flex-col">
            {/* Entrar por URL a un módulo sin permiso lleva al inicio. */}
            {sinAcceso ? <Navigate to="/" replace /> : <Outlet />}
          </div>
          {/* Espacio reservado cuando el teclado en pantalla está abierto. */}
          <div aria-hidden style={{ height: 'var(--osk-height, 0px)' }} />
        </main>
      </div>
    </div>
  );
}
