import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CostoGanadoMetodo, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { plantDateOnly, plantToday } from '../../common/plant-date';
import type {
  CrearListaPreciosDto,
  CrearTarifaDto,
  DesactivarTarifaDto,
  EditarListaPreciosDto,
  GuardarCostoGanadoDto,
  GuardarPreciosDto,
  GuardarReglasDto,
  GuardarServiciosDto,
} from './dto/maestros.dto';

const dia = (d: Date) => d.toISOString().slice(0, 10);
const n = (v: Prisma.Decimal | number | null | undefined) => (v == null ? null : Number(v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Tablas maestras de los talleres: listas de precios con vigencia, tarifas de
 * proceso con historial, reglas por corte y costo del ganado por lote.
 */
@Injectable()
export class MaestrosService {
  constructor(private readonly prisma: PrismaService) {}

  private async validarCliente(clienteId?: string | null) {
    if (!clienteId) return;
    const c = await this.prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
    if (!c) throw new NotFoundException('Cliente no encontrado.');
  }

  private async nombreCliente(clienteId?: string | null) {
    if (!clienteId) return null;
    return (await this.prisma.cliente.findUnique({ where: { id: clienteId }, select: { concepto: true } }))?.concepto ?? null;
  }

  /** Deja constancia en la bitácora de los talleres (no interrumpe si falla). */
  private async registrar(ctx: AuthContext, accion: string, entidad: string, referencia: string | null, detalle?: Prisma.InputJsonValue) {
    await this.prisma.tallerActividad
      .create({ data: { plantId: ctx.plantId, userId: ctx.userId, accion, entidad, referencia, detalle } })
      .catch(() => undefined);
  }

  // ===================== Precios =====================

  async listas(ctx: AuthContext) {
    const listas = await this.prisma.precioLista.findMany({
      where: { plantId: ctx.plantId },
      orderBy: [{ vigenteDesde: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        nombre: true,
        vigenteDesde: true,
        observaciones: true,
        updatedAt: true,
        cliente: { select: { id: true, concepto: true } },
        items: { select: { precioKg: true } },
      },
    });
    const hoy = plantToday();
    // La vigente de cada alcance es la de fecha más reciente que ya empezó.
    const vigentes = new Set<string>();
    const vistos = new Set<string>();
    for (const l of listas) {
      const alcance = l.cliente?.id ?? 'general';
      if (dia(l.vigenteDesde) <= hoy && !vistos.has(alcance)) {
        vistos.add(alcance);
        vigentes.add(l.id);
      }
    }
    return listas.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      vigenteDesde: dia(l.vigenteDesde),
      observaciones: l.observaciones,
      updatedAt: l.updatedAt,
      clienteId: l.cliente?.id ?? null,
      cliente: l.cliente?.concepto ?? null,
      productos: l.items.length,
      conPrecio: l.items.filter((i) => Number(i.precioKg) > 0).length,
      vigente: vigentes.has(l.id),
      futura: dia(l.vigenteDesde) > hoy,
    }));
  }

  /** Lista con todos los productos activos (los que no tienen precio, en cero). */
  async lista(ctx: AuthContext, id: string) {
    const lista = await this.prisma.precioLista.findFirst({
      where: { id, plantId: ctx.plantId },
      select: {
        id: true,
        nombre: true,
        vigenteDesde: true,
        observaciones: true,
        cliente: { select: { id: true, concepto: true } },
        items: { select: { productId: true, precioKg: true } },
      },
    });
    if (!lista) throw new NotFoundException('Lista de precios no encontrada.');
    const productos = await this.prisma.product.findMany({
      where: { plantId: ctx.plantId, active: true },
      select: { id: true, codigo: true, nombre: true, categoria: true },
      orderBy: { codigo: 'asc' },
    });
    const precio = new Map(lista.items.map((i) => [i.productId, Number(i.precioKg)]));
    return {
      id: lista.id,
      nombre: lista.nombre,
      vigenteDesde: dia(lista.vigenteDesde),
      observaciones: lista.observaciones,
      clienteId: lista.cliente?.id ?? null,
      cliente: lista.cliente?.concepto ?? null,
      precios: productos
        .map((p) => ({ productId: p.id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, precioKg: precio.get(p.id) ?? 0 }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })),
    };
  }

  async crearLista(ctx: AuthContext, dto: CrearListaPreciosDto) {
    await this.validarCliente(dto.clienteId);
    let items: { productId: string; precioKg: Prisma.Decimal | number }[];
    if (dto.copiarDeId) {
      const origen = await this.prisma.precioLista.findFirst({
        where: { id: dto.copiarDeId, plantId: ctx.plantId },
        select: { items: { select: { productId: true, precioKg: true } } },
      });
      if (!origen) throw new NotFoundException('Lista de origen no encontrada.');
      items = origen.items;
    } else {
      const productos = await this.prisma.product.findMany({ where: { plantId: ctx.plantId, active: true }, select: { id: true } });
      items = productos.map((p) => ({ productId: p.id, precioKg: 0 }));
    }
    const lista = await this.prisma.precioLista.create({
      data: {
        plantId: ctx.plantId,
        clienteId: dto.clienteId ?? null,
        nombre: dto.nombre,
        vigenteDesde: plantDateOnly(dto.vigenteDesde),
        observaciones: dto.observaciones || null,
        createdById: ctx.userId,
        items: { createMany: { data: items.map((i) => ({ productId: i.productId, precioKg: i.precioKg })) } },
      },
      select: { id: true },
    });
    await this.registrar(ctx, 'crear', 'lista_precios', dto.nombre, {
      vigenteDesde: dto.vigenteDesde,
      cliente: await this.nombreCliente(dto.clienteId),
      copiada: !!dto.copiarDeId,
    });
    return this.lista(ctx, lista.id);
  }

  async editarLista(ctx: AuthContext, id: string, dto: EditarListaPreciosDto) {
    const antes = await this.lista(ctx, id);
    await this.prisma.precioLista.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.vigenteDesde !== undefined && { vigenteDesde: plantDateOnly(dto.vigenteDesde) }),
        ...(dto.observaciones !== undefined && { observaciones: dto.observaciones || null }),
      },
    });
    await this.registrar(ctx, 'editar', 'lista_precios', antes.nombre, {
      antes: { nombre: antes.nombre, vigenteDesde: antes.vigenteDesde },
      despues: { ...dto },
    } as Prisma.InputJsonValue);
    return this.lista(ctx, id);
  }

  async eliminarLista(ctx: AuthContext, id: string) {
    const lista = await this.lista(ctx, id);
    await this.prisma.precioLista.delete({ where: { id } });
    await this.registrar(ctx, 'eliminar', 'lista_precios', lista.nombre, { vigenteDesde: lista.vigenteDesde, cliente: lista.cliente });
    return { ok: true };
  }

  /** Guarda precios por producto (o por código, al cargar un Excel). */
  async guardarPrecios(ctx: AuthContext, id: string, dto: GuardarPreciosDto) {
    const lista = await this.lista(ctx, id);
    const anterior = new Map(lista.precios.map((p) => [p.productId, p]));
    const productos = await this.prisma.product.findMany({
      where: { plantId: ctx.plantId },
      select: { id: true, codigo: true },
    });
    const porCodigo = new Map(productos.map((p) => [p.codigo.trim(), p.id]));
    const ids = new Set(productos.map((p) => p.id));
    const noEncontrados: string[] = [];
    const precios = new Map<string, number>();
    for (const p of dto.precios) {
      const productId = p.productId && ids.has(p.productId) ? p.productId : p.codigo ? porCodigo.get(p.codigo.trim()) : undefined;
      if (!productId) {
        noEncontrados.push(p.codigo ?? p.productId ?? '');
        continue;
      }
      precios.set(productId, p.precioKg);
    }
    await this.prisma.$transaction(
      [...precios].map(([productId, precioKg]) =>
        this.prisma.precioListaItem.upsert({
          where: { listaId_productId: { listaId: id, productId } },
          create: { listaId: id, productId, precioKg },
          update: { precioKg },
        }),
      ),
    );
    await this.prisma.precioLista.update({ where: { id }, data: { updatedAt: new Date() } });
    const cambios = [...precios]
      .map(([productId, despues]) => ({ codigo: anterior.get(productId)?.codigo ?? productId, antes: anterior.get(productId)?.precioKg ?? 0, despues }))
      .filter((c) => c.antes !== c.despues);
    if (cambios.length) {
      await this.registrar(ctx, 'precios', 'lista_precios', lista.nombre, { total: cambios.length, cambios: cambios.slice(0, 300) });
    }
    return { actualizados: precios.size, noEncontrados };
  }

  /**
   * Precio por kg vigente en una fecha para cada producto: la lista del cliente
   * más reciente que ya empezó; si no tiene, la general.
   */
  async preciosVigentes(plantId: string, clienteId: string | null, fecha: string) {
    const listas = await this.prisma.precioLista.findMany({
      where: {
        plantId,
        vigenteDesde: { lte: plantDateOnly(fecha) },
        OR: [{ clienteId: null }, ...(clienteId ? [{ clienteId }] : [])],
      },
      orderBy: { vigenteDesde: 'desc' },
      select: { clienteId: true, items: { select: { productId: true, precioKg: true } } },
    });
    const precios = new Map<string, number>();
    const general = listas.find((l) => l.clienteId === null);
    const propia = clienteId ? listas.find((l) => l.clienteId === clienteId) : undefined;
    for (const l of [general, propia]) for (const i of l?.items ?? []) precios.set(i.productId, Number(i.precioKg));
    return precios;
  }

  // ===================== Tarifas =====================

  /** Última versión de cada concepto (general y, si se pide, la del cliente encima). */
  async tarifas(ctx: AuthContext, clienteId?: string, fecha = plantToday()) {
    const filas = await this.prisma.tarifaProceso.findMany({
      where: {
        plantId: ctx.plantId,
        vigenteDesde: { lte: plantDateOnly(fecha) },
        OR: [{ clienteId: null }, ...(clienteId ? [{ clienteId }] : [])],
      },
      orderBy: [{ vigenteDesde: 'desc' }, { createdAt: 'desc' }],
    });
    const ultima = new Map<string, (typeof filas)[number]>();
    for (const t of filas) {
      const clave = `${t.clienteId ?? 'general'}|${t.concepto}`;
      if (!ultima.has(clave)) ultima.set(clave, t);
    }
    const generales = [...ultima.values()].filter((t) => t.clienteId === null);
    const propias = [...ultima.values()].filter((t) => t.clienteId !== null);
    const conceptos = new Map<string, { general: (typeof filas)[number] | null; cliente: (typeof filas)[number] | null }>();
    for (const t of generales) conceptos.set(t.concepto, { general: t, cliente: null });
    for (const t of propias) conceptos.set(t.concepto, { general: conceptos.get(t.concepto)?.general ?? null, cliente: t });
    const dto = (t: (typeof filas)[number] | null) =>
      t && { id: t.id, valor: Number(t.valor), vigenteDesde: dia(t.vigenteDesde), activo: t.activo, base: t.base, categoria: t.categoria };
    return [...conceptos]
      .map(([concepto, v]) => {
        const efectiva = v.cliente ?? v.general!;
        return {
          concepto,
          categoria: efectiva.categoria,
          base: efectiva.base,
          valor: Number(efectiva.valor),
          activo: efectiva.activo,
          vigenteDesde: dia(efectiva.vigenteDesde),
          origen: v.cliente ? ('cliente' as const) : ('general' as const),
          general: dto(v.general),
          cliente: dto(v.cliente),
        };
      })
      .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.concepto.localeCompare(b.concepto, 'es', { numeric: true }));
  }

  async historialTarifa(ctx: AuthContext, concepto: string, clienteId?: string) {
    const filas = await this.prisma.tarifaProceso.findMany({
      where: { plantId: ctx.plantId, concepto, clienteId: clienteId ?? null },
      orderBy: [{ vigenteDesde: 'desc' }, { createdAt: 'desc' }],
    });
    const usuarios = await this.prisma.appUser.findMany({
      where: { id: { in: [...new Set(filas.map((f) => f.createdById))] } },
      select: { id: true, fullName: true },
    });
    const nombre = new Map(usuarios.map((u) => [u.id, u.fullName]));
    return filas.map((f) => ({
      id: f.id,
      valor: Number(f.valor),
      base: f.base,
      vigenteDesde: dia(f.vigenteDesde),
      activo: f.activo,
      creadoPor: nombre.get(f.createdById) ?? null,
      createdAt: f.createdAt,
    }));
  }

  /** Nuevo valor de una tarifa: queda como una versión más con su fecha de vigencia. */
  async crearTarifa(ctx: AuthContext, dto: CrearTarifaDto) {
    await this.validarCliente(dto.clienteId);
    const anterior = await this.prisma.tarifaProceso.findFirst({
      where: { plantId: ctx.plantId, concepto: dto.concepto.trim(), clienteId: dto.clienteId ?? null },
      orderBy: [{ vigenteDesde: 'desc' }, { createdAt: 'desc' }],
    });
    const creada = await this.prisma.tarifaProceso.create({
      data: {
        plantId: ctx.plantId,
        clienteId: dto.clienteId ?? null,
        categoria: dto.categoria,
        concepto: dto.concepto.trim(),
        base: dto.base,
        valor: dto.valor,
        vigenteDesde: plantDateOnly(dto.vigenteDesde),
        createdById: ctx.userId,
      },
    });
    await this.registrar(ctx, anterior ? 'editar' : 'crear', 'tarifa', creada.concepto, {
      cliente: await this.nombreCliente(dto.clienteId),
      antes: anterior ? Number(anterior.valor) : null,
      despues: dto.valor,
      base: dto.base,
      vigenteDesde: dto.vigenteDesde,
    });
    return creada;
  }

  /** Deja de cobrar un concepto desde hoy (versión inactiva; el historial se conserva). */
  async desactivarTarifa(ctx: AuthContext, dto: DesactivarTarifaDto) {
    const actual = await this.prisma.tarifaProceso.findFirst({
      where: { plantId: ctx.plantId, concepto: dto.concepto, clienteId: dto.clienteId ?? null },
      orderBy: [{ vigenteDesde: 'desc' }, { createdAt: 'desc' }],
    });
    if (!actual) throw new NotFoundException('Tarifa no encontrada.');
    await this.registrar(ctx, actual.activo ? 'desactivar' : 'activar', 'tarifa', actual.concepto, {
      cliente: await this.nombreCliente(actual.clienteId),
    });
    return this.prisma.tarifaProceso.create({
      data: {
        plantId: ctx.plantId,
        clienteId: actual.clienteId,
        categoria: actual.categoria,
        concepto: actual.concepto,
        base: actual.base,
        valor: actual.valor,
        vigenteDesde: plantDateOnly(),
        activo: !actual.activo,
        createdById: ctx.userId,
      },
    });
  }

  // ===================== Reglas por corte =====================

  async reglas(ctx: AuthContext, clienteId?: string) {
    const [productos, reglas] = await Promise.all([
      this.prisma.product.findMany({
        where: { plantId: ctx.plantId, active: true },
        select: { id: true, codigo: true, nombre: true },
        orderBy: { codigo: 'asc' },
      }),
      this.prisma.reglaCorte.findMany({
        where: { plantId: ctx.plantId, OR: [{ clienteId: null }, ...(clienteId ? [{ clienteId }] : [])] },
      }),
    ]);
    const general = new Map(reglas.filter((r) => !r.clienteId).map((r) => [r.productId, r]));
    const propia = new Map(reglas.filter((r) => r.clienteId).map((r) => [r.productId, r]));
    return productos
      .map((p) => {
        const r = propia.get(p.id) ?? general.get(p.id);
        return {
          productId: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          retoma: r?.retoma ?? false,
          piking: r?.piking ?? false,
          congelacion: r?.congelacion ?? false,
          kgCongelados: n(r?.kgCongelados),
          origen: propia.has(p.id) ? ('cliente' as const) : general.has(p.id) ? ('general' as const) : null,
        };
      })
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  }

  /** Reemplaza las reglas del alcance (general o del cliente) por las enviadas con alguna marca. */
  async guardarReglas(ctx: AuthContext, dto: GuardarReglasDto) {
    await this.validarCliente(dto.clienteId);
    const clienteId = dto.clienteId ?? null;
    const marcadas = dto.reglas.filter((r) => r.retoma || r.piking || r.congelacion);
    await this.prisma.$transaction([
      this.prisma.reglaCorte.deleteMany({ where: { plantId: ctx.plantId, clienteId } }),
      this.prisma.reglaCorte.createMany({
        data: marcadas.map((r) => ({
          plantId: ctx.plantId,
          clienteId,
          productId: r.productId,
          retoma: r.retoma,
          piking: r.piking,
          congelacion: r.congelacion,
          kgCongelados: r.congelacion ? (r.kgCongelados ?? null) : null,
        })),
      }),
    ]);
    await this.registrar(ctx, 'editar', 'reglas_corte', (await this.nombreCliente(dto.clienteId)) ?? 'GENERALES', {
      retoma: marcadas.filter((r) => r.retoma).length,
      piking: marcadas.filter((r) => r.piking).length,
      congelacion: marcadas.filter((r) => r.congelacion).length,
    });
    return this.reglas(ctx, dto.clienteId);
  }

  /** Productos marcados como retoma para un cliente (sus reglas pesan sobre las generales). */
  async productosRetoma(plantId: string, clienteId: string) {
    const reglas = await this.reglasEfectivas(plantId, clienteId);
    return new Set([...reglas].filter(([, r]) => r.retoma).map(([k]) => k));
  }

  /** Regla vigente de cada producto para un cliente: la propia o, si no tiene, la general. */
  async reglasEfectivas(plantId: string, clienteId: string) {
    const reglas = await this.prisma.reglaCorte.findMany({
      where: { plantId, OR: [{ clienteId: null }, { clienteId }] },
      select: { clienteId: true, productId: true, retoma: true, piking: true, congelacion: true, kgCongelados: true },
    });
    const efectiva = new Map<string, { retoma: boolean; piking: boolean; congelacion: boolean; kgCongelados: number | null }>();
    for (const r of [...reglas.filter((x) => !x.clienteId), ...reglas.filter((x) => x.clienteId)]) {
      efectiva.set(r.productId, { retoma: r.retoma, piking: r.piking, congelacion: r.congelacion, kgCongelados: n(r.kgCongelados) });
    }
    return efectiva;
  }

  // ===================== Servicios manuales =====================

  async servicios(ctx: AuthContext, ref: { productionOrderId?: string; transferOrderId?: string }) {
    if (!ref.productionOrderId === !ref.transferOrderId) throw new BadRequestException('Indica la orden de producción o la de traslado.');
    const filas = await this.prisma.servicioManual.findMany({
      where: { plantId: ctx.plantId, productionOrderId: ref.productionOrderId ?? null, transferOrderId: ref.transferOrderId ?? null },
      orderBy: { concepto: 'asc' },
    });
    return filas.map((f) => ({ concepto: f.concepto, cantidad: Number(f.cantidad), valorUnitario: n(f.valorUnitario) }));
  }

  /** Reemplaza las cantidades digitadas de un lote o proceso. */
  async guardarServicios(ctx: AuthContext, dto: GuardarServiciosDto) {
    const ref = { productionOrderId: dto.productionOrderId ?? null, transferOrderId: dto.transferOrderId ?? null };
    if (!ref.productionOrderId === !ref.transferOrderId) throw new BadRequestException('Indica la orden de producción o la de traslado.');
    const existe = ref.productionOrderId
      ? await this.prisma.productionOrder.findFirst({ where: { id: ref.productionOrderId, plantId: ctx.plantId }, select: { id: true, opNumber: true } })
      : await this.prisma.transferOrder.findFirst({ where: { id: ref.transferOrderId!, plantId: ctx.plantId }, select: { id: true, otNumber: true } });
    if (!existe) throw new NotFoundException('Orden no encontrada.');
    await this.prisma.$transaction([
      this.prisma.servicioManual.deleteMany({ where: { plantId: ctx.plantId, ...ref } }),
      this.prisma.servicioManual.createMany({
        data: dto.servicios.map((s) => ({
          plantId: ctx.plantId,
          ...ref,
          concepto: s.concepto.trim(),
          cantidad: s.cantidad,
          valorUnitario: s.valorUnitario ?? null,
          createdById: ctx.userId,
        })),
      }),
    ]);
    await this.registrar(
      ctx,
      'editar',
      'servicios',
      'opNumber' in existe ? `OP ${existe.opNumber}` : `OT ${existe.otNumber}`,
      { servicios: dto.servicios.map((s) => ({ concepto: s.concepto, cantidad: s.cantidad })) },
    );
    return this.servicios(ctx, { productionOrderId: dto.productionOrderId, transferOrderId: dto.transferOrderId });
  }

  // ===================== Costo de ganado =====================

  /** Órdenes de beneficio del periodo con sus pesos y el costo registrado. */
  async costosGanado(ctx: AuthContext, desde?: string, hasta?: string) {
    const hoy = plantToday();
    const ordenes = await this.prisma.ordenBeneficio.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        date: { gte: plantDateOnly(desde ?? `${hoy.slice(0, 7)}-01`), lte: plantDateOnly(hasta ?? hoy) },
      },
      orderBy: [{ date: 'desc' }, { reference: 'desc' }],
      select: {
        id: true,
        reference: true,
        date: true,
        cliente: true,
        guias: true,
        animalCount: true,
        observaciones: true,
        animales: { select: { pesoTotalKg: true, proveedor: true } },
        eventos: { select: { canalPiezas: { select: { pesoKg: true } } } },
        costoGanado: true,
      },
    });
    return ordenes.map((o) => {
      const pesoPieKg = o.animales.reduce((s, a) => s + Number(a.pesoTotalKg ?? 0), 0);
      const pesoCanalKg = o.eventos.reduce((s, e) => s + e.canalPiezas.reduce((t, p) => t + Number(p.pesoKg), 0), 0);
      const proveedores = [...new Set(o.animales.map((a) => a.proveedor).filter(Boolean))];
      const c = o.costoGanado;
      const total = c
        ? totalCosto(c.metodo, Number(c.valorUnitario), {
            pesoPieKg,
            pesoFincaKg: n(c.pesoFincaKg),
            pesoCanalKg,
            animales: o.animalCount,
          })
        : null;
      return {
        ordenId: o.id,
        reference: o.reference,
        fecha: dia(o.date),
        cliente: o.cliente,
        guias: o.guias,
        observaciones: o.observaciones,
        animales: o.animalCount,
        proveedor: proveedores.join(' / ') || null,
        pesoPieKg: r2(pesoPieKg),
        pesoCanalKg: r2(pesoCanalKg),
        costo: c && {
          metodo: c.metodo,
          valorUnitario: Number(c.valorUnitario),
          pesoFincaKg: n(c.pesoFincaKg),
          proveedor: c.proveedor,
          referencia: c.referencia,
          observaciones: c.observaciones,
          total: total == null ? null : r2(total),
          porKgPie: total != null && pesoPieKg ? r2(total / pesoPieKg) : null,
          porKgCanal: total != null && pesoCanalKg ? r2(total / pesoCanalKg) : null,
          porAnimal: total != null && o.animalCount ? r2(total / o.animalCount) : null,
        },
      };
    });
  }

  async guardarCostoGanado(ctx: AuthContext, ordenId: string, dto: GuardarCostoGanadoDto) {
    const orden = await this.prisma.ordenBeneficio.findFirst({
      where: { id: ordenId, plantId: ctx.plantId, deletedAt: null },
      select: { id: true, reference: true, date: true, costoGanado: true },
    });
    if (!orden) throw new NotFoundException('Orden de beneficio no encontrada.');
    if (dto.metodo === CostoGanadoMetodo.kg_finca && !dto.pesoFincaKg) {
      throw new BadRequestException('Para liquidar por peso en finca escribe el peso en finca.');
    }
    const data = {
      metodo: dto.metodo,
      valorUnitario: dto.valorUnitario,
      pesoFincaKg: dto.metodo === CostoGanadoMetodo.kg_finca ? dto.pesoFincaKg : null,
      proveedor: dto.proveedor || null,
      referencia: dto.referencia || null,
      observaciones: dto.observaciones || null,
    };
    await this.prisma.costoGanado.upsert({
      where: { ordenBeneficioId: ordenId },
      create: { plantId: ctx.plantId, ordenBeneficioId: ordenId, createdById: ctx.userId, ...data },
      update: data,
    });
    const c = orden.costoGanado;
    await this.registrar(ctx, c ? 'editar' : 'crear', 'costo_ganado', `OB ${orden.reference} · ${dia(orden.date)}`, {
      antes: c ? { metodo: c.metodo, valorUnitario: Number(c.valorUnitario), pesoFincaKg: n(c.pesoFincaKg) } : null,
      despues: { metodo: dto.metodo, valorUnitario: dto.valorUnitario, pesoFincaKg: data.pesoFincaKg ?? null },
    });
    return { ok: true };
  }

  async eliminarCostoGanado(ctx: AuthContext, ordenId: string) {
    const c = await this.prisma.costoGanado.findFirst({
      where: { ordenBeneficioId: ordenId, plantId: ctx.plantId },
      include: { ordenBeneficio: { select: { reference: true, date: true } } },
    });
    if (!c) return { ok: true };
    await this.prisma.costoGanado.delete({ where: { id: c.id } });
    await this.registrar(ctx, 'eliminar', 'costo_ganado', `OB ${c.ordenBeneficio.reference} · ${dia(c.ordenBeneficio.date)}`, {
      antes: { metodo: c.metodo, valorUnitario: Number(c.valorUnitario) },
    });
    return { ok: true };
  }
}

/** Valor total del ganado de un lote según la forma de liquidarlo. */
export function totalCosto(
  metodo: CostoGanadoMetodo,
  valor: number,
  p: { pesoPieKg: number; pesoFincaKg: number | null; pesoCanalKg: number; animales: number },
) {
  switch (metodo) {
    case 'kg_pie':
      return valor * p.pesoPieKg;
    case 'kg_finca':
      return p.pesoFincaKg == null ? null : valor * p.pesoFincaKg;
    case 'kg_canal':
      return valor * p.pesoCanalKg;
    case 'por_animal':
      return valor * p.animales;
    case 'valor_total':
      return valor;
  }
}
