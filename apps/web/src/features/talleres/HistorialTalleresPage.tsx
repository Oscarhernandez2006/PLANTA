import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileSpreadsheet, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn, plantToday } from '@/lib/utils';
import { descargarExcel } from './excel';
import { pesosDec } from './maestros-api';
import { Encabezado, SinDatos } from './ui';

interface Evento {
  fecha: string;
  userId: string | null;
  usuario: string | null;
  modulo: 'desposte' | 'acondicionamiento' | 'maestros';
  accion: string;
  referencia: string | null;
  descripcion: string;
  detalle: unknown;
}

const MODULO: Record<Evento['modulo'], { label: string; tone: 'success' | 'info' | 'warning' }> = {
  desposte: { label: 'Desposte', tone: 'success' },
  acondicionamiento: { label: 'Acondicionamiento', tone: 'info' },
  maestros: { label: 'Precios y costos', tone: 'warning' },
};
const ACCION: Record<string, string> = {
  crear: 'Creación',
  editar: 'Modificación',
  eliminar: 'Eliminación',
  precios: 'Precios',
  activar: 'Activación',
  desactivar: 'Desactivación',
  etiquetar: 'Etiquetado',
  anular: 'Anulación',
};

const hora = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });

export function HistorialTalleresPage() {
  const [desde, setDesde] = useState(() => `${plantToday().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(plantToday);
  const [modulo, setModulo] = useState<'' | Evento['modulo']>('');
  const [usuario, setUsuario] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const q = useQuery({
    queryKey: ['talleres', 'historial', desde, hasta],
    queryFn: async () => (await api.get<Evento[]>('/talleres/historial', { params: { desde: desde || undefined, hasta: hasta || undefined } })).data,
  });

  const usuarios = useMemo(() => [...new Set((q.data ?? []).map((e) => e.usuario).filter((x): x is string => !!x))].sort(), [q.data]);
  const eventos = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return (q.data ?? []).filter(
      (e) =>
        (!modulo || e.modulo === modulo) &&
        (!usuario || e.usuario === usuario) &&
        (!t || e.descripcion.toUpperCase().includes(t) || (e.referencia ?? '').toUpperCase().includes(t)),
    );
  }, [q.data, modulo, usuario, busqueda]);

  async function exportar() {
    await descargarExcel(`Historial talleres ${desde} a ${hasta}.xlsx`, [
      {
        nombre: 'Historial',
        titulo: `Historial de los talleres — ${desde} a ${hasta}`,
        columnas: [
          { titulo: 'Fecha y hora', valor: (e: Evento) => hora(e.fecha), ancho: 18 },
          { titulo: 'Usuario', valor: (e: Evento) => e.usuario, ancho: 26 },
          { titulo: 'Módulo', valor: (e: Evento) => MODULO[e.modulo].label, ancho: 18 },
          { titulo: 'Acción', valor: (e: Evento) => ACCION[e.accion] ?? e.accion, ancho: 14 },
          { titulo: 'Referencia', valor: (e: Evento) => e.referencia, ancho: 22 },
          { titulo: 'Descripción', valor: (e: Evento) => e.descripcion, ancho: 80 },
        ],
        filas: eventos,
      },
    ]);
  }

  const th = 'border-b border-border bg-muted px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground';
  const td = 'border-b border-border px-3 py-2 align-top';

  return (
    <div className="scrollbar-app flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <Encabezado
        titulo="Historial de los talleres"
        descripcion="Quién hizo qué y cuándo: órdenes, etiquetado y anulaciones, y cada cambio en precios, tarifas, reglas, costos y cantidades."
        cargando={q.isFetching}
        onRefrescar={() => q.refetch()}
      />
      <Card className="flex shrink-0 flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <Label htmlFor="hi-desde">Desde</Label>
          <Input id="hi-desde" type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hi-hasta">Hasta</Label>
          <Input id="hi-hasta" type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hi-modulo">Módulo</Label>
          <Select id="hi-modulo" className="h-9 w-48" value={modulo} onChange={(e) => setModulo(e.target.value as typeof modulo)}>
            <option value="">Todos</option>
            {Object.entries(MODULO).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="hi-usuario">Usuario</Label>
          <Select id="hi-usuario" className="h-9 w-56" value={usuario} onChange={(e) => setUsuario(e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </div>
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Buscar OP, OB, concepto…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <Button variant="outline" onClick={exportar} disabled={!eventos.length}>
          <FileSpreadsheet className="text-emerald-700" /> Excel
        </Button>
      </Card>

      <Card className="shrink-0 overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(th, 'w-36')}>Fecha</th>
              <th className={cn(th, 'w-48')}>Usuario</th>
              <th className={cn(th, 'w-40')}>Módulo</th>
              <th className={cn(th, 'w-32')}>Acción</th>
              <th className={th}>Descripción</th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((e, i) => {
              const cambios = (e.detalle as { cambios?: { codigo: string; antes: number; despues: number }[] } | null)?.cambios;
              const abierto = abiertos.has(i);
              return (
                <Fragment key={`${e.fecha}-${i}`}>
                  <tr
                    className={cn('hover:bg-muted/40', cambios && 'cursor-pointer')}
                    onClick={() =>
                      cambios &&
                      setAbiertos((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  >
                    <td className={cn(td, 'tabular-nums text-xs')}>{hora(e.fecha)}</td>
                    <td className={td}>{e.usuario ?? '—'}</td>
                    <td className={td}>
                      <Badge tone={MODULO[e.modulo].tone}>{MODULO[e.modulo].label}</Badge>
                    </td>
                    <td className={cn(td, e.accion === 'anular' || e.accion === 'eliminar' ? 'text-red-700' : '')}>{ACCION[e.accion] ?? e.accion}</td>
                    <td className={td}>
                      <span className="inline-flex items-start gap-1">
                        {cambios && (abierto ? <ChevronDown className="mt-0.5 size-3.5" /> : <ChevronRight className="mt-0.5 size-3.5" />)}
                        {e.descripcion}
                      </span>
                    </td>
                  </tr>
                  {abierto && cambios && (
                    <tr>
                      <td colSpan={5} className="border-b border-border bg-muted/20 px-6 py-2">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs sm:grid-cols-3 lg:grid-cols-4">
                          {cambios.map((c) => (
                            <span key={c.codigo} className="tabular-nums">
                              <span className="text-muted-foreground">{c.codigo}:</span> {pesosDec(c.antes)} → <strong>{pesosDec(c.despues)}</strong>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!eventos.length && <SinDatos texto={q.isLoading ? 'Cargando…' : 'Sin movimientos en el periodo'} />}
      </Card>
    </div>
  );
}
