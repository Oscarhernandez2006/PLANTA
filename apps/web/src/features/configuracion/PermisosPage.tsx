import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, LoaderCircle, Save, Search, ShieldCheck, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { navGroups } from '@/components/layout/nav-config';
import { useAuth } from '@/features/auth/auth-context';
import { MODULO_PERMISOS } from '@/lib/permisos';
import { cn } from '@/lib/utils';
import { useGuardarPermisos, useUsuariosPermisos, type UsuarioPermisos } from './permisos-api';

const TOTAL_MODULOS = navGroups.reduce((n, g) => n + g.items.length, 0);

function resumen(u: UsuarioPermisos) {
  if (u.accesoTotal) return { texto: 'Acceso total', tono: 'success' as const };
  if (!u.modulos.length) return { texto: 'Sin módulos', tono: 'neutral' as const };
  return { texto: `${u.modulos.length} de ${TOTAL_MODULOS} módulos`, tono: 'info' as const };
}

/**
 * Configuración → Permisos: qué módulos del menú ve cada usuario. No depende
 * del rol: un módulo no permitido no aparece en el menú y no se puede abrir.
 */
export function PermisosPage() {
  const { user, refreshUser } = useAuth();
  const usuarios = useUsuariosPermisos();
  const guardar = useGuardarPermisos();
  const [busqueda, setBusqueda] = useState('');
  const [params] = useSearchParams();
  const [seleccionId, setSeleccionId] = useState<string | null>(params.get('usuario'));
  const [accesoTotal, setAccesoTotal] = useState(false);
  const [modulos, setModulos] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const lista = usuarios.data ?? [];
  const seleccionado = lista.find((u) => u.id === seleccionId) ?? null;
  const q = busqueda.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      lista.filter(
        (u) => !q || u.fullName.toLowerCase().includes(q) || (u.documentId ?? '').includes(q),
      ),
    [lista, q],
  );

  // Al elegir otro usuario se cargan sus permisos guardados.
  useEffect(() => {
    if (!seleccionado) return;
    setAccesoTotal(seleccionado.accesoTotal);
    setModulos(new Set(seleccionado.modulos));
    setAviso(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionado?.id]);

  const cambios =
    !!seleccionado &&
    (accesoTotal !== seleccionado.accesoTotal ||
      modulos.size !== seleccionado.modulos.length ||
      seleccionado.modulos.some((m) => !modulos.has(m)));

  function alternar(ruta: string) {
    setModulos((prev) => {
      const s = new Set(prev);
      if (s.has(ruta)) s.delete(ruta);
      else s.add(ruta);
      return s;
    });
  }

  function alternarGrupo(rutas: string[]) {
    setModulos((prev) => {
      const s = new Set(prev);
      const todos = rutas.every((r) => s.has(r));
      rutas.forEach((r) => (todos ? s.delete(r) : s.add(r)));
      return s;
    });
  }

  async function onGuardar() {
    if (!seleccionado) return;
    setAviso(null);
    try {
      await guardar.mutateAsync({ id: seleccionado.id, accesoTotal, modulos: [...modulos] });
      setAviso({ ok: true, texto: `Permisos de ${seleccionado.fullName} guardados.` });
      // Si son los propios permisos, el menú se actualiza de inmediato.
      if (seleccionado.id === user?.id) await refreshUser();
    } catch (error) {
      const msg = (error as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      setAviso({ ok: false, texto: (Array.isArray(msg) ? msg.join(' ') : msg) || 'No se pudieron guardar los permisos.' });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-9 text-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Permisos</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Módulos que puede ver cada usuario, sin importar su rol. Un módulo sin permiso no aparece en el menú.
          </p>
        </div>
      </div>

      {usuarios.isError ? (
        <Card className="p-6 text-sm text-red-700">No se pudo cargar la lista de usuarios.</Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,340px)_1fr]">
          {/* Usuarios */}
          <Card className="flex max-h-[calc(100vh-12rem)] flex-col overflow-hidden">
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-8"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o cédula…"
                  aria-label="Buscar usuario"
                />
              </div>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-border overflow-auto">
              {usuarios.isLoading ? (
                <li className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Cargando…
                </li>
              ) : filtrados.length === 0 ? (
                <li className="p-6 text-center text-sm text-muted-foreground">Ningún usuario coincide.</li>
              ) : (
                filtrados.map((u) => {
                  const r = resumen(u);
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => setSeleccionId(u.id)}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50',
                          u.id === seleccionId && 'bg-muted',
                        )}
                      >
                        <UserRound className="size-5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {u.fullName}
                            {u.id === user?.id && <span className="text-muted-foreground"> (tú)</span>}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            C.C. {u.documentId ?? '—'}
                            {!u.active && ' · Inactivo'}
                          </span>
                        </span>
                        <Badge tone={r.tono}>{r.texto}</Badge>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </Card>

          {/* Módulos del usuario elegido */}
          {!seleccionado ? (
            <Card className="flex min-h-60 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              Selecciona un usuario para ver y cambiar sus módulos.
            </Card>
          ) : (
            <Card className="space-y-5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{seleccionado.fullName}</h2>
                  <p className="text-sm text-muted-foreground">C.C. {seleccionado.documentId ?? '—'}</p>
                </div>
                <Button onClick={onGuardar} disabled={!cambios || guardar.isPending}>
                  {guardar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Guardar permisos
                </Button>
              </div>

              {aviso && (
                <p
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm font-medium',
                    aviso.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700',
                  )}
                >
                  {aviso.texto}
                </p>
              )}

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 accent-emerald-600"
                  checked={accesoTotal}
                  onChange={(e) => setAccesoTotal(e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-semibold">Acceso total</span>
                  <span className="block text-xs text-muted-foreground">
                    Ve todos los módulos, incluidos los que se agreguen en el futuro.
                  </span>
                </span>
              </label>

              {/* Columnas (no grilla): cada grupo ocupa solo su alto, sin huecos en blanco. */}
              <div className={cn('gap-4 sm:columns-2 xl:columns-3', accesoTotal && 'pointer-events-none opacity-50')}>
                {navGroups.map((g) => {
                  const rutas = g.items.map((i) => i.to);
                  const marcados = rutas.filter((r) => accesoTotal || modulos.has(r)).length;
                  const todos = marcados === rutas.length;
                  return (
                    <div key={g.title} className="mb-4 break-inside-avoid rounded-md border border-border">
                      <button
                        type="button"
                        onClick={() => alternarGrupo(rutas)}
                        className="flex w-full items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2 text-left"
                        title={todos ? 'Quitar todos los módulos del grupo' : 'Dar todos los módulos del grupo'}
                      >
                        <span className="text-xs font-semibold uppercase tracking-wide">{g.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {marcados}/{rutas.length}
                        </span>
                      </button>
                      <ul className="space-y-0.5 p-2">
                        {g.items.map((item) => {
                          const activo = accesoTotal || modulos.has(item.to);
                          const Icon = item.icon;
                          return (
                            <li key={item.to}>
                              <label className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
                                <input
                                  type="checkbox"
                                  className="size-4 accent-emerald-600"
                                  checked={activo}
                                  onChange={() => alternar(item.to)}
                                />
                                <Icon className="size-4 shrink-0 text-muted-foreground" />
                                <span className="flex-1">{item.label}</span>
                                {item.to === MODULO_PERMISOS && seleccionado.id === user?.id && (
                                  <span className="text-[10px] font-medium text-amber-700">no te lo quites</span>
                                )}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {!cambios && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="size-3.5" /> Sin cambios pendientes.
                </p>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
