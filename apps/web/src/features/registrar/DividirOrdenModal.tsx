import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowLeft,
  Check,
  ClipboardList,
  Equal,
  Eraser,
  GripVertical,
  LoaderCircle,
  Plus,
  Split,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatOB, type AnimalDisponible } from './orden-beneficio-api';

const SIN_TIPO = 'SIN TIPO';
const etiquetaAnimal = (a: AnimalDisponible) => `A${String(a.reference).padStart(2, '0')}`;
const kg = (n: number | null) =>
  n == null ? '—' : `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg`;
const tipoDe = (a: AnimalDisponible) => a.tipoAnimal?.trim().toUpperCase() || SIN_TIPO;
const porReferencia = (a: AnimalDisponible, b: AnimalDisponible) => a.reference - b.reference;

/** Destino de un arrastre: la zona "Sin asignar" o el índice de una orden. */
type Destino = 'libres' | number;

interface Arrastre {
  /** Animales que viajan (uno, o todos los de un tipo). */
  ids: string[];
  /** Texto del fantasma que sigue al dedo/puntero. */
  etiqueta: string;
  /** Desde dónde salió (para no soltar en el mismo sitio). */
  origen: Destino;
  x: number;
  y: number;
  /** Mientras no se supere el umbral se trata como un toque, no un arrastre. */
  movido: boolean;
}

const UMBRAL_PX = 6;

/** Reparte los animales (en orden de pesaje) en `partes` órdenes lo más parejo posible. */
function repartirParejo(animales: AnimalDisponible[], partes: number): string[][] {
  const orden = [...animales].sort(porReferencia);
  const base = Math.floor(orden.length / partes);
  const resto = orden.length % partes;
  const grupos: string[][] = [];
  let i = 0;
  for (let p = 0; p < partes; p++) {
    const n = base + (p < resto ? 1 : 0);
    grupos.push(orden.slice(i, i + n).map((a) => a.id));
    i += n;
  }
  return grupos;
}

/** Una orden por cada tipo de animal (NOVILLO, VACA…), en orden alfabético. */
function repartirPorTipo(animales: AnimalDisponible[]): string[][] {
  const porTipo = new Map<string, AnimalDisponible[]>();
  for (const a of animales) {
    const t = tipoDe(a);
    porTipo.set(t, [...(porTipo.get(t) ?? []), a]);
  }
  return [...porTipo.keys()]
    .sort()
    .map((t) => (porTipo.get(t) ?? []).sort(porReferencia).map((a) => a.id));
}

/** Busca la zona de soltado bajo el puntero (atributo data-destino). */
function destinoBajoPuntero(x: number, y: number): Destino | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-destino]');
  if (!el) return null;
  const v = el.dataset.destino!;
  return v === 'libres' ? 'libres' : Number(v);
}

/**
 * Antes de crear la orden de beneficio pregunta si va una sola orden con
 * todos los animales de la guía o si se dividen en varias órdenes
 * consecutivas (OB n, n+1…). Al dividir, el operario arrastra cada animal
 * (o todos los de un tipo) hasta la orden donde va; deben quedar todos
 * repartidos.
 */
export function DividirOrdenModal({
  open,
  onClose,
  guia,
  cliente,
  animales,
  primeraReferencia,
  guardando,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  guia: string;
  cliente: string;
  /** Animales de la guía aún sin orden (Peso en Pie). */
  animales: AnimalDisponible[];
  /** Próximo consecutivo OB (vista previa; se confirma al guardar). */
  primeraReferencia: number | null;
  guardando: boolean;
  error: string | null;
  /** Ids de Peso en Pie por orden. Una sola orden = un solo grupo con todos. */
  onConfirm: (animales: string[][]) => void;
}) {
  const [modo, setModo] = useState<'elegir' | 'dividir'>('elegir');
  const [grupos, setGrupos] = useState<string[][]>([]);
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [sobre, setSobre] = useState<Destino | null>(null);
  const arrastreRef = useRef<Arrastre | null>(null);

  const disponibles = animales.length;
  const porId = useMemo(() => new Map(animales.map((a) => [a.id, a])), [animales]);
  const tipos = useMemo(
    () => [...new Set(animales.map(tipoDe))].sort(),
    [animales],
  );

  useEffect(() => {
    if (open) {
      setModo('elegir');
      // Si hay más de un tipo, arranca repartido por tipo (el caso típico);
      // si no, en dos partes iguales.
      setGrupos(tipos.length > 1 ? repartirPorTipo(animales) : repartirParejo(animales, 2));
      setFiltroTipo(null);
      setArrastre(null);
      setSobre(null);
      arrastreRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const asignados = useMemo(() => new Set(grupos.flat()), [grupos]);
  const libres = animales
    .filter((a) => !asignados.has(a.id))
    .sort(porReferencia);
  const libresFiltrados = filtroTipo ? libres.filter((a) => tipoDe(a) === filtroTipo) : libres;
  const repartidos = asignados.size;
  const faltan = disponibles - repartidos;
  const valido = faltan === 0 && grupos.length >= 2 && grupos.every((g) => g.length >= 1);
  const ob = (i: number) =>
    primeraReferencia != null ? formatOB(primeraReferencia + i) : `Orden ${i + 1}`;

  /** Mueve `ids` al destino: a una orden o de vuelta a "Sin asignar". */
  function mover(ids: string[], destino: Destino) {
    const set = new Set(ids);
    setGrupos((gs) =>
      gs.map((g, i) => {
        const sin = g.filter((x) => !set.has(x));
        return destino === i ? [...sin, ...ids] : sin;
      }),
    );
  }
  function agregarOrden() {
    if (grupos.length >= disponibles) return;
    setGrupos((gs) => [...gs, []]);
  }
  function quitarOrden(i: number) {
    if (grupos.length <= 2) return;
    setGrupos((gs) => gs.filter((_, j) => j !== i));
  }

  // ---- Arrastrar y soltar con Pointer Events (sirve igual con mouse y táctil) ----
  function iniciarArrastre(
    e: ReactPointerEvent<HTMLElement>,
    ids: string[],
    etiqueta: string,
    origen: Destino,
  ) {
    if (guardando || ids.length === 0 || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const a: Arrastre = { ids, etiqueta, origen, x: e.clientX, y: e.clientY, movido: false };
    arrastreRef.current = a;
    setArrastre(a);
  }
  function moverArrastre(e: ReactPointerEvent<HTMLElement>) {
    const a = arrastreRef.current;
    if (!a) return;
    const movido = a.movido || Math.hypot(e.clientX - a.x, e.clientY - a.y) > UMBRAL_PX;
    const n = { ...a, x: e.clientX, y: e.clientY, movido };
    arrastreRef.current = n;
    setArrastre(n);
    if (movido) setSobre(destinoBajoPuntero(e.clientX, e.clientY));
  }
  /** Suelta. Si no se movió, se trata como un toque y se ejecuta `alTocar`. */
  function soltarArrastre(e: ReactPointerEvent<HTMLElement>, alTocar?: () => void) {
    const a = arrastreRef.current;
    arrastreRef.current = null;
    setArrastre(null);
    setSobre(null);
    if (!a) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (!a.movido) {
      alTocar?.();
      return;
    }
    const destino = destinoBajoPuntero(e.clientX, e.clientY);
    if (destino != null && destino !== a.origen) mover(a.ids, destino);
  }
  function cancelarArrastre() {
    arrastreRef.current = null;
    setArrastre(null);
    setSobre(null);
  }
  const arrastrando = (id: string) => !!arrastre?.movido && arrastre.ids.includes(id);

  /** Resumen "3 NOVILLO · 2 VACA" y peso total de un grupo. */
  function resumen(ids: string[]) {
    const ani = ids.map((id) => porId.get(id)).filter((a): a is AnimalDisponible => !!a);
    const conteo = new Map<string, number>();
    let peso = 0;
    for (const a of ani) {
      conteo.set(tipoDe(a), (conteo.get(tipoDe(a)) ?? 0) + 1);
      peso += a.pesoKg ?? 0;
    }
    return {
      tipos: [...conteo.entries()].map(([t, n]) => `${n} ${t}`).join(' · '),
      peso,
    };
  }

  const tarjetaAnimal =
    'flex select-none flex-col items-start rounded-lg border-2 px-2.5 py-1.5 text-left leading-tight transition-colors touch-none cursor-grab active:cursor-grabbing disabled:opacity-50';
  const zonaResaltada = (d: Destino) =>
    arrastre?.movido && sobre === d && arrastre.origen !== d;

  return (
    <Dialog
      open={open}
      onClose={guardando ? () => {} : onClose}
      title={modo === 'elegir' ? '¿Cómo querés crear la orden?' : 'Dividir en varias órdenes'}
      description={`Guía ${guia} · ${cliente} · ${disponibles} ${disponibles === 1 ? 'animal disponible' : 'animales disponibles'}`}
      className={modo === 'elegir' ? 'max-w-2xl' : 'max-w-6xl'}
    >
      {modo === 'elegir' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={guardando}
            onClick={() => onConfirm([animales.map((a) => a.id)])}
            className="flex flex-col items-start gap-3 rounded-xl border-2 border-border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60"
          >
            <span className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {guardando ? (
                <LoaderCircle className="size-7 animate-spin" />
              ) : (
                <ClipboardList className="size-7" />
              )}
            </span>
            <span className="text-lg font-semibold">Una sola orden</span>
            <span className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{ob(0)}</span> con los{' '}
              {disponibles} animales de la guía.
            </span>
          </button>
          <button
            type="button"
            disabled={guardando || disponibles < 2}
            onClick={() => setModo('dividir')}
            title={disponibles < 2 ? 'Se necesitan al menos 2 animales para dividir' : undefined}
            className="flex flex-col items-start gap-3 rounded-xl border-2 border-border bg-card p-5 text-left transition-colors hover:border-sky-600 hover:bg-sky-50 disabled:opacity-50"
          >
            <span className="flex size-12 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <Split className="size-7" />
            </span>
            <span className="text-lg font-semibold">Dividir en varias órdenes</span>
            <span className="text-sm text-muted-foreground">
              Arrastrá cada animal a la orden donde va (p. ej. hembras y machos por separado).
              {tipos.length > 1 && (
                <>
                  {' '}
                  Esta guía trae: <span className="font-medium text-foreground">{tipos.join(', ')}</span>.
                </>
              )}
            </span>
          </button>
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Resumen del reparto */}
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 px-4 py-2.5',
              faltan === 0 ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50',
            )}
          >
            <span className="text-sm font-medium">
              Repartidos <span className="text-xl font-bold tabular-nums">{repartidos}</span> de{' '}
              <span className="text-xl font-bold tabular-nums">{disponibles}</span>
              <span
                className={cn(
                  'ml-3 text-sm font-semibold',
                  faltan === 0 ? 'text-emerald-700' : 'text-amber-700',
                )}
              >
                {faltan === 0
                  ? '✓ Todos los animales repartidos'
                  : `Faltan ${faltan} ${faltan === 1 ? 'animal' : 'animales'}`}
              </span>
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="[&_svg]:size-4"
                disabled={tipos.length < 2}
                title={tipos.length < 2 ? 'Todos los animales son del mismo tipo' : 'Una orden por cada tipo de animal'}
                onClick={() => setGrupos(repartirPorTipo(animales))}
              >
                <Tags /> Repartir por tipo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="[&_svg]:size-4"
                onClick={() => setGrupos(repartirParejo(animales, grupos.length))}
              >
                <Equal /> Partes iguales
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="[&_svg]:size-4"
                onClick={() => setGrupos((gs) => gs.map(() => []))}
              >
                <Eraser /> Limpiar
              </Button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_minmax(0,1.6fr)]">
            {/* Disponibles (también es zona para devolver animales) */}
            <section
              data-destino="libres"
              className={cn(
                'flex max-h-[55vh] flex-col rounded-lg border-2 bg-muted/30 transition-colors',
                zonaResaltada('libres') ? 'border-primary bg-primary/10 ring-2 ring-primary/30' : 'border-border',
              )}
            >
              <header className="space-y-2 border-b border-border px-3 py-2">
                <h3 className="text-sm font-semibold">
                  Sin asignar <span className="tabular-nums text-muted-foreground">({libres.length})</span>
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Arrastrá un animal a la orden donde va. Arrastrá una ficha de tipo para llevar todos los de ese tipo.
                </p>
                {tipos.length > 1 && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setFiltroTipo(null)}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-xs font-medium',
                        filtroTipo == null ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
                      )}
                    >
                      Todos
                    </button>
                    {tipos.map((t) => {
                      const idsTipo = libres.filter((a) => tipoDe(a) === t).map((a) => a.id);
                      return (
                        <button
                          key={t}
                          type="button"
                          title={idsTipo.length ? `Tocá para filtrar · arrastrá para llevar los ${idsTipo.length} ${t} a una orden` : 'Ninguno sin asignar'}
                          onPointerDown={(e) =>
                            iniciarArrastre(e, idsTipo, `${idsTipo.length} ${t}`, 'libres')
                          }
                          onPointerMove={moverArrastre}
                          onPointerUp={(e) =>
                            soltarArrastre(e, () => setFiltroTipo((f) => (f === t ? null : t)))
                          }
                          onPointerCancel={cancelarArrastre}
                          className={cn(
                            'touch-none select-none rounded-full border px-2 py-0.5 text-xs font-medium',
                            idsTipo.length ? 'cursor-grab active:cursor-grabbing' : 'opacity-60',
                            filtroTipo === t ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
                          )}
                        >
                          <GripVertical className="-ml-1 mr-0.5 inline size-3 opacity-60" />
                          {t} ({idsTipo.length})
                        </button>
                      );
                    })}
                  </div>
                )}
              </header>
              <div className="flex min-h-[120px] flex-wrap content-start gap-1.5 overflow-y-auto p-2">
                {libresFiltrados.length === 0 ? (
                  <p className="w-full py-6 text-center text-sm text-muted-foreground">
                    {libres.length === 0
                      ? 'Todos los animales están asignados. Soltá aquí uno para devolverlo.'
                      : 'Ningún animal de este tipo sin asignar.'}
                  </p>
                ) : (
                  libresFiltrados.map((a) => (
                    <div
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      title="Arrastrá a una orden"
                      onPointerDown={(e) => iniciarArrastre(e, [a.id], etiquetaAnimal(a), 'libres')}
                      onPointerMove={moverArrastre}
                      onPointerUp={(e) => soltarArrastre(e)}
                      onPointerCancel={cancelarArrastre}
                      className={cn(
                        tarjetaAnimal,
                        'border-border bg-card hover:border-primary',
                        arrastrando(a.id) && 'opacity-30',
                      )}
                    >
                      <span className="text-base font-bold tabular-nums">{etiquetaAnimal(a)}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {tipoDe(a)} · {kg(a.pesoKg)}
                        {a.corral ? ` · C${a.corral}` : ''}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Órdenes (cada una es zona de soltado) */}
            <section className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto pr-1">
              {grupos.map((g, i) => {
                const r = resumen(g);
                return (
                  <div
                    key={i}
                    data-destino={i}
                    className={cn(
                      'rounded-lg border-2 bg-card transition-colors',
                      zonaResaltada(i)
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                        : 'border-border',
                    )}
                  >
                    <header className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-bold tabular-nums text-primary">{ob(i)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {g.length === 0
                            ? 'Sin animales — soltá aquí los que van en esta orden'
                            : `${g.length} ${g.length === 1 ? 'animal' : 'animales'} · ${r.tipos} · ${kg(r.peso)}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Quitar ${ob(i)}`}
                        title={grupos.length <= 2 ? 'Mínimo 2 órdenes al dividir' : 'Quitar esta orden (sus animales vuelven a Sin asignar)'}
                        className="flex size-9 shrink-0 items-center justify-center rounded-md text-red-600 hover:bg-red-50 disabled:pointer-events-none disabled:opacity-40"
                        disabled={grupos.length <= 2}
                        onClick={() => quitarOrden(i)}
                      >
                        <Trash2 className="size-5" />
                      </button>
                    </header>
                    <div
                      className={cn(
                        'flex min-h-[56px] flex-wrap gap-1.5 border-t border-dashed border-border px-2 py-2',
                      )}
                    >
                      {g
                        .map((id) => porId.get(id))
                        .filter((a): a is AnimalDisponible => !!a)
                        .sort(porReferencia)
                        .map((a) => (
                          <div
                            key={a.id}
                            role="button"
                            tabIndex={0}
                            title="Arrastrá a otra orden o a Sin asignar · tocá para quitar"
                            onPointerDown={(e) => iniciarArrastre(e, [a.id], etiquetaAnimal(a), i)}
                            onPointerMove={moverArrastre}
                            onPointerUp={(e) => soltarArrastre(e, () => mover([a.id], 'libres'))}
                            onPointerCancel={cancelarArrastre}
                            className={cn(
                              tarjetaAnimal,
                              'group relative border-sky-200 bg-sky-50 hover:border-sky-400',
                              arrastrando(a.id) && 'opacity-30',
                            )}
                          >
                            <span className="text-base font-bold tabular-nums">{etiquetaAnimal(a)}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {tipoDe(a)} · {kg(a.pesoKg)}
                            </span>
                            <X className="absolute right-1 top-1 size-3 text-red-500 opacity-0 group-hover:opacity-100" />
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                className="h-11 border-dashed text-base [&_svg]:size-5"
                onClick={agregarOrden}
                disabled={grupos.length >= disponibles}
              >
                <Plus /> Agregar orden
              </Button>
            </section>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              className="h-12 px-4 text-base [&_svg]:size-5"
              onClick={() => setModo('elegir')}
              disabled={guardando}
            >
              <ArrowLeft /> Volver
            </Button>
            <Button
              type="button"
              className="h-12 px-6 text-base [&_svg]:size-5"
              disabled={!valido || guardando}
              title={
                !valido
                  ? faltan > 0
                    ? `Faltan ${faltan} animales por asignar`
                    : 'Cada orden debe tener al menos un animal'
                  : undefined
              }
              onClick={() => onConfirm(grupos)}
            >
              {guardando ? <LoaderCircle className="animate-spin" /> : <Check />}
              Crear {grupos.length} órdenes
            </Button>
          </div>

          {/* Fantasma que sigue al puntero mientras se arrastra */}
          {arrastre?.movido && (
            <div
              className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-primary bg-card px-3 py-1.5 text-base font-bold shadow-lg"
              style={{ left: arrastre.x, top: arrastre.y }}
            >
              {arrastre.etiqueta}
              {arrastre.ids.length > 1 && (
                <span className="ml-1.5 rounded bg-primary px-1.5 text-xs text-primary-foreground">
                  ×{arrastre.ids.length}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
