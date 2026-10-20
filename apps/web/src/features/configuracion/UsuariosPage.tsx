import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoaderCircle, Pencil, Plus, Power, Search, ShieldCheck, UserCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { useAuth } from '@/features/auth/auth-context';
import { ROLES, ROL_LABEL, type Rol } from '@/lib/roles';
import { cn, formatDateTime } from '@/lib/utils';
import { useActualizarUsuario, useCrearUsuario, useUsuarios, type Usuario } from './usuarios-api';

function mensajeError(error: unknown, fallback: string) {
  const msg = (error as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
  return (Array.isArray(msg) ? msg.join(' ') : msg) || fallback;
}

/**
 * Configuración → Usuarios: alta y edición de usuarios (nombre, cédula, rol,
 * PIN). No se borran porque tienen historial; se desactivan y ya no pueden
 * iniciar sesión. Los módulos que ve cada uno se asignan en Permisos.
 */
export function UsuariosPage() {
  const { user } = useAuth();
  const usuarios = useUsuarios();
  const actualizar = useActualizarUsuario();
  const [busqueda, setBusqueda] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<Usuario | 'nuevo' | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const q = busqueda.trim().toLowerCase();
  const lista = useMemo(
    () =>
      (usuarios.data ?? []).filter(
        (u) =>
          (verInactivos || u.active) &&
          (!q || u.fullName.toLowerCase().includes(q) || (u.documentId ?? '').includes(q)),
      ),
    [usuarios.data, q, verInactivos],
  );

  async function alternarActivo(u: Usuario) {
    const accion = u.active ? 'desactivar' : 'activar';
    if (u.active && !window.confirm(`¿Desactivar a ${u.fullName}? Ya no podrá iniciar sesión.`)) return;
    setAviso(null);
    try {
      await actualizar.mutateAsync({ id: u.id, active: !u.active });
      setAviso({ ok: true, texto: `${u.fullName} ${u.active ? 'desactivado' : 'activado'}.` });
    } catch (error) {
      setAviso({ ok: false, texto: mensajeError(error, `No se pudo ${accion} el usuario.`) });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <UserCog className="size-9 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Personas que inician sesión con su cédula y PIN. Los módulos de cada uno se asignan en Permisos.
            </p>
          </div>
        </div>
        <Button onClick={() => setEditando('nuevo')}>
          <Plus className="size-4" /> Nuevo usuario
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

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o cédula…"
              aria-label="Buscar usuario"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4"
              checked={verInactivos}
              onChange={(e) => setVerInactivos(e.target.checked)}
            />
            Mostrar inactivos
          </label>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Nombre</TH>
              <TH>Cédula</TH>
              <TH>Rol</TH>
              <TH>Estado</TH>
              <TH>Módulos</TH>
              <TH>Último ingreso</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {usuarios.isLoading ? (
              <TR>
                <TD colSpan={7} className="py-8 text-center text-muted-foreground">
                  <LoaderCircle className="mr-2 inline size-4 animate-spin" /> Cargando…
                </TD>
              </TR>
            ) : usuarios.isError ? (
              <TR>
                <TD colSpan={7} className="py-8 text-center text-red-700">
                  {mensajeError(usuarios.error, 'No se pudo cargar la lista de usuarios.')}
                </TD>
              </TR>
            ) : lista.length === 0 ? (
              <TR>
                <TD colSpan={7} className="py-8 text-center text-muted-foreground">
                  Ningún usuario coincide.
                </TD>
              </TR>
            ) : (
              lista.map((u) => (
                <TR key={u.id} className={cn(!u.active && 'opacity-60')}>
                  <TD className="font-medium">
                    {u.fullName}
                    {u.id === user?.id && <span className="text-muted-foreground"> (tú)</span>}
                  </TD>
                  <TD className="tabular-nums">{u.documentId ?? '—'}</TD>
                  <TD>{ROL_LABEL[u.role] ?? u.role}</TD>
                  <TD>
                    <Badge tone={u.active ? 'success' : 'danger'}>{u.active ? 'Activo' : 'Inactivo'}</Badge>
                  </TD>
                  <TD className="text-sm text-muted-foreground">
                    {u.accesoTotal ? 'Acceso total' : u.modulos.length ? `${u.modulos.length} módulos` : 'Sin módulos'}
                  </TD>
                  <TD className="text-sm text-muted-foreground">
                    {u.lastLogin ? formatDateTime(u.lastLogin) : '—'}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditando(u)} title="Editar datos y PIN">
                        <Pencil className="size-4" /> Editar
                      </Button>
                      <Link
                        to={`/configuracion/permisos?usuario=${u.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium hover:bg-accent"
                        title="Asignar módulos"
                      >
                        <ShieldCheck className="size-4" /> Permisos
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actualizar.isPending || u.id === user?.id}
                        onClick={() => alternarActivo(u)}
                        title={u.id === user?.id ? 'No puedes desactivar tu propio usuario' : undefined}
                      >
                        <Power className="size-4" /> {u.active ? 'Desactivar' : 'Activar'}
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      {editando && (
        <UsuarioDialog
          usuario={editando === 'nuevo' ? null : editando}
          onClose={() => setEditando(null)}
          onGuardado={(texto) => {
            setEditando(null);
            setAviso({ ok: true, texto });
          }}
        />
      )}
    </div>
  );
}

function UsuarioDialog({
  usuario,
  onClose,
  onGuardado,
}: {
  usuario: Usuario | null;
  onClose: () => void;
  onGuardado: (texto: string) => void;
}) {
  const crear = useCrearUsuario();
  const actualizar = useActualizarUsuario();
  const nuevo = !usuario;
  const [fullName, setFullName] = useState(usuario?.fullName ?? '');
  const [documentId, setDocumentId] = useState(usuario?.documentId ?? '');
  const [role, setRole] = useState<Rol>(usuario?.role ?? 'operario');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pendiente = crear.isPending || actualizar.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 3) return setError('Escribe el nombre completo.');
    if (!/^\d{5,15}$/.test(documentId)) return setError('La cédula debe tener entre 5 y 15 dígitos.');
    if (nuevo || pin) {
      if (!/^\d{4,12}$/.test(pin)) return setError('El PIN debe tener entre 4 y 12 dígitos.');
      if (pin !== pin2) return setError('Los dos PIN no coinciden.');
    }
    try {
      if (nuevo) {
        const u = await crear.mutateAsync({ fullName: fullName.trim(), documentId, role, pin });
        onGuardado(`Usuario ${u.fullName} creado. Asígnale sus módulos en Permisos para que pueda usar el sistema.`);
      } else {
        const u = await actualizar.mutateAsync({
          id: usuario.id,
          fullName: fullName.trim(),
          documentId,
          role,
          ...(pin ? { pin } : {}),
        });
        onGuardado(`Usuario ${u.fullName} actualizado${pin ? ' (PIN cambiado)' : ''}.`);
      }
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar el usuario.'));
    }
  }

  return (
    <Dialog
      open
      onClose={() => !pendiente && onClose()}
      title={nuevo ? 'Nuevo usuario' : `Editar ${usuario.fullName}`}
      description={nuevo ? 'Inicia sesión con su cédula y el PIN que le asignes.' : 'Deja el PIN vacío para conservar el actual.'}
      className="max-w-lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="u-nombre">Nombre completo</Label>
          <Input id="u-nombre" autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="u-cedula">Cédula</Label>
            <Input
              id="u-cedula"
              inputMode="numeric"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value.replace(/\D/g, '').slice(0, 15))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-rol">Rol</Label>
            <Select id="u-rol" value={role} onChange={(e) => setRole(e.target.value as Rol)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="u-pin">{nuevo ? 'PIN' : 'Nuevo PIN (opcional)'}</Label>
            <Input
              id="u-pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder="4 a 12 dígitos"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-pin2">Confirmar PIN</Label>
            <Input
              id="u-pin2"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 12))}
              disabled={!nuevo && !pin}
            />
          </div>
        </div>
        {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={pendiente}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pendiente}>
            {pendiente && <LoaderCircle className="size-4 animate-spin" />}
            {nuevo ? 'Crear usuario' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
