// Reconstruye en la BD un lote procesado en FrigoAPP a partir de sus reportes
// (HTML con extensión .xls): beneficio (uno por lote), traslado de canales a
// desposte y desposte detallado. Crea Peso en Camión, Peso en Pie, una Orden de
// Beneficio por reporte de beneficio (con sacrificio, pieles, canal caliente e
// histórico), una Orden de Despacho con las canales trasladadas y una Orden de
// Producción con sus etiquetas, enlazado igual que lo haría la app.
// Uso: node scripts/import-lote-frigoapp.cjs --beneficio a.xls b.xls --traslado t.xls --desposte d.xls
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Catálogo de subproductos que la app crea al caer cada animal (subproducto-items.ts).
const SUBPRODUCTOS = [
  'cachete', 'puya', 'regaton', 'ojos', 'cocote', 'desperdicio_res_comestible', 'hueso_cabeza_res',
  'chinchurria_precocida', 'ubres_comestible', 'chinchurria_b', 'canuta_comestible', 'chinchurria_cruda',
  'creadillas_comestible', 'cuajos_res_comestible', 'libros_comestible', 'libros_megatiendas',
  'pares_comestible', 'recorte_libro_comestible', 'tripa_ancha_cruda', 'tripa_ancha_res_comestible',
  'tripa_calambuco_res_comestible', 'vena_orta_res_comestible', 'viscera_roja_completa',
  'viscera_roja_incompleta', 'visera_novillo', 'higado', 'corazon', 'rinones', 'bazo_pajarilla', 'lengua',
];
const TIPOS_ANIMAL = ['vaca', 'novilla', 'toro', 'novillo', 'bufala', 'bufalo'];

// Mismo cálculo que apps/api/src/common/codigo-barras.ts.
const codigoDesdeSecuencia = (n) => String(10_000_000n + (BigInt(n) * 61_803_401n) % 90_000_000n);

// Igual que nombreTarifa() de historico-beneficio.sync.ts.
const nombreTarifa = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[.,]/g, ' ')
    .replace(/\bS\s*A\s*S\b|\bSAS\b/g, ' ').replace(/\s+/g, ' ').trim();

function filas(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      c[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
    ),
  );
}
const num = (s) => Number(String(s).replace(/,/g, ''));
const leer = (f) => fs.readFileSync(path.resolve(f), 'utf8');
const dia = (s) => new Date(`${s}T00:00:00Z`);
const hora = (fecha, h) => new Date(`${fecha}T${h}-05:00`);
const sinCodigo = (s) => s.replace(/^\S+\s+-\s+/, '').trim().toUpperCase();

function parseBeneficio(file) {
  const html = leer(file);
  const lote = html.match(/ORDEN\/LOTE No\. (\d+)/)[1];
  const rows = filas(html);
  const fecha = rows.find((r) => r.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(r[0]))[0];
  const guiaRow = rows.find((r) => r.length === 3 && /^\w{10,}$/.test(r[0]) && / - /.test(r[1]));
  const animales = rows
    .filter((r) => r.length === 14 && /^\d+$/.test(r[0]))
    .map((r) => ({
      seq: Number(r[0]), guia: r[1], hora: r[2], tipo: r[4].toLowerCase(), codigo: r[5],
      pep: num(r[7]), pec: num(r[8]), piel: num(r[9]), obs: r[11] || null, destino: r[13] || null,
    }));
  for (const a of animales) if (!TIPOS_ANIMAL.includes(a.tipo)) throw new Error(`Tipo de animal desconocido: ${a.tipo}`);
  return {
    lote, fecha, animales,
    guia: guiaRow[0],
    proveedorNit: guiaRow[1].split(' - ')[0].trim(), proveedor: sinCodigo(guiaRow[1]),
    procedencia: sinCodigo(guiaRow[2]),
  };
}

function parseTraslado(file) {
  const html = leer(file);
  const rows = filas(html);
  return {
    numero: html.match(/DESPOSTE No\. (\d+)/)[1],
    fecha: rows.find((r) => r.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(r[0]))[0],
    canales: rows
      .filter((r) => r.length === 12 && /^\d+$/.test(r[0]))
      .map((r) => ({ lote: r[1], codigo: r[3], caliente: num(r[8]), frio: num(r[9]) })),
  };
}

function parseDesposte(file) {
  const html = leer(file);
  const rows = filas(html);
  const fechas = rows.find((r) => r.length === 3 && /^\d{4}-\d{2}-\d{2}$/.test(r[0]));
  return {
    op: html.match(/PRODUCCIÓN \(PESAJE Y ETIQUETADO\) No\. (\d+)/)[1],
    fechaDesposte: fechas[1],
    piezas: rows
      .filter((r) => r.length === 7 && /^\d+-\d+$/.test(r[1]))
      .map((r) => ({ barcode: r[1], producto: r[2], unds: Number(r[4]), kg: num(r[5]), operario: r[6] })),
  };
}

function args() {
  const out = { beneficio: [] };
  let actual = null;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) actual = a.slice(2);
    else if (actual === 'beneficio') out.beneficio.push(a);
    else out[actual] = a;
  }
  if (!out.beneficio.length || !out.traslado || !out.desposte) {
    throw new Error('Uso: import-lote-frigoapp.cjs --beneficio a.xls [b.xls…] --traslado t.xls --desposte d.xls');
  }
  return out;
}

async function main() {
  const a = args();
  const lotes = a.beneficio.map(parseBeneficio).sort((x, y) => x.animales[0].hora.localeCompare(y.animales[0].hora));
  const traslado = parseTraslado(a.traslado);
  const desposte = parseDesposte(a.desposte);

  const fecha = lotes[0].fecha;
  if (lotes.some((l) => l.fecha !== fecha)) throw new Error('Los lotes de beneficio tienen fechas distintas.');
  const guias = [...new Set(lotes.map((l) => l.guia))];
  if (guias.length !== 1) throw new Error(`Se esperaba una sola guía y hay ${guias.length}: ${guias.join(', ')}`);
  const guia = guias[0];
  const { proveedor, proveedorNit, procedencia } = lotes[0];

  const plant = await prisma.plant.findFirstOrThrow({ select: { id: true } });
  const plantId = plant.id;
  const user = await prisma.appUser.findFirstOrThrow({ where: { plantId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  const cliente = await prisma.cliente.findFirstOrThrow({
    where: { nit: '830505537' },
    include: { bodegas: { where: { active: true }, orderBy: { code: 'asc' } }, tiendas: { orderBy: { codigo: 'asc' } } },
  });
  const productos = new Map(
    (await prisma.product.findMany({ where: { plantId }, select: { id: true, codigo: true, nombre: true } })).map((p) => [p.codigo, p]),
  );
  const faltan = [...new Set(desposte.piezas.map((p) => p.producto))].filter((c) => !productos.has(c));
  if (faltan.length) throw new Error(`Productos inexistentes: ${faltan.join(', ')}`);

  const ya = await prisma.ordenBeneficio.count({ where: { plantId, date: dia(fecha) } });
  if (ya) throw new Error(`Ya hay ${ya} órdenes de beneficio el ${fecha}; no se importa para no duplicar.`);

  const tarifas = await prisma.historicoTarifa.findMany({ where: { plantId } });
  const tarifa = tarifas.find((t) => nombreTarifa(t.cliente) === nombreTarifa(cliente.concepto));
  const clientesPp = await prisma.clienteProducto.findMany({ where: { clienteId: cliente.id } });
  const pp = new Map(clientesPp.map((c) => [c.productId, c]));

  const resumen = await prisma.$transaction(
    async (tx) => {
      const sig = async (model, campo) => ((await tx[model].aggregate({ _max: { [campo]: true } }))._max[campo] ?? 0) + 1;
      const diaProceso = dia(fecha);
      const inicio = hora(fecha, lotes[0].animales[0].hora);
      const todos = lotes.flatMap((l) => l.animales);
      const netoPie = todos.reduce((s, x) => s + x.pep, 0);

      // Catálogos de proveedor y procedencia (los usa Peso en Camión).
      await tx.proveedor.upsert({ where: { concepto: proveedor }, update: {}, create: { concepto: proveedor, nit: proveedorNit } });
      await tx.procedencia.upsert({ where: { concepto: procedencia }, update: {}, create: { concepto: procedencia } });

      const bc = await sig('pesoCamion', 'reference');
      await tx.pesoCamion.create({
        data: {
          plantId, reference: bc, referenciaLote: procedencia, date: diaProceso, guia, procedencia, proveedor,
          cliente: cliente.concepto, cantidad: todos.length, netoKg: netoPie,
          pesoPromedioKg: Math.round((netoPie / todos.length) * 100) / 100,
          observaciones: `IMPORTADO DE FRIGOAPP (LOTES ${lotes.map((l) => l.lote).join(', ')})`,
          status: 'cerrada', pieStatus: 'cerrada', createdById: user.id, createdAt: inicio,
        },
      });

      const bp = await sig('pesoEnPie', 'bpReference');
      const piezaPorCodigo = new Map();
      let animalRef = 0;
      let turno = 0;
      const ordenes = [];
      for (const [i, l] of lotes.entries()) {
        const fin = hora(fecha, l.animales.at(-1).hora);
        const ob = await tx.ordenBeneficio.create({
          data: {
            plantId, reference: i + 1, date: diaProceso, cliente: cliente.concepto, guias: [guia],
            animalCount: l.animales.length, observaciones: `LOTE FRIGOAPP ${l.lote}`, status: 'procesado',
            pcReference: bc, bpReference: bp, createdById: user.id, createdAt: hora(fecha, l.animales[0].hora),
            pielesCerradaAt: fin, pielesCerradaById: user.id, canalCalienteCerradaAt: fin, canalCalienteCerradaById: user.id,
          },
        });
        ordenes.push(ob);
        for (const x of l.animales) {
          const t = hora(fecha, x.hora);
          await tx.pesoEnPie.create({
            data: {
              plantId, reference: ++animalRef, bpReference: bp, bcReference: bc, date: diaProceso, guia, procedencia,
              proveedor, cliente: cliente.concepto, tipoAnimal: ['vaca', 'novilla', 'bufala'].includes(x.tipo) ? 'HEMBRA' : 'MACHO',
              animalNo: x.codigo, animalCount: 1, tipoPesaje: 'individual', pesoTotalKg: x.pep, pesoPromedioKg: x.pep,
              cantidad: todos.length, status: 'en_insensibilizacion', ordenBeneficioId: ob.id, ordenSequence: x.seq,
              createdById: user.id, createdAt: inicio,
            },
          });
          const evento = await tx.ordenBeneficioEvento.create({
            data: {
              ordenBeneficioId: ob.id, sequence: x.seq, stunnedAt: t, operatorId: user.id, createdAt: t,
              pesoPielKg: x.piel, pieladoAt: t, pielOperatorId: user.id,
              canalAnimalTipo: x.tipo, canalTipo: 'canal_completa',
            },
          });
          await tx.subproductoItem.createMany({ data: SUBPRODUCTOS.map((tipo) => ({ eventoId: evento.id, tipo, createdAt: t })) });
          const pieza = await tx.canalPieza.create({
            data: {
              eventoId: evento.id, pieza: 'canal', pesoKg: x.pec, turno: ++turno, weighedAt: t, operatorId: user.id,
              createdAt: t, bodega: cliente.bodegas[0]?.nombre ?? null, cava: 'CAVA 1',
              destino: x.destino?.toUpperCase() ?? null, observaciones: x.obs?.toUpperCase() ?? null,
            },
          });
          piezaPorCodigo.set(x.codigo, { pieza, x });
        }
        // Fila del Histórico Sacrificio, como HistoricoBeneficioSync.sincronizarOrden.
        const cuenta = { novillo: 0, novilla: 0, vaca: 0, toro: 0, bufalo: 0 };
        for (const x of l.animales) cuenta[x.tipo === 'bufala' ? 'bufalo' : x.tipo]++;
        await tx.historicoBeneficio.create({
          data: {
            plantId, fecha: diaProceso, proveedor, firmador: cliente.concepto, cliente: cliente.concepto,
            granja: procedencia, guiaIca: guia, lote: ob.reference, ...cuenta,
            pieles: Math.round(l.animales.reduce((s, x) => s + x.piel, 0)),
            pesoPieKg: l.animales.reduce((s, x) => s + x.pep, 0),
            pesoCalienteKg: Math.round(l.animales.reduce((s, x) => s + x.pec, 0) * 100) / 100,
            tarifa: tarifa ? tarifa.valorBase : 0, ordenBeneficioId: ob.id, createdById: user.id,
          },
        });
      }

      // Traslado de canales a sala (Orden de Despacho MP a proceso).
      const fTraslado = dia(traslado.fecha);
      const tTraslado = new Date(`${traslado.fecha}T07:00:00-05:00`);
      const od = await tx.dispatchOrder.create({
        data: {
          plantId, odNumber: await sig('dispatchOrder', 'odNumber'), registrationDate: fTraslado, processDate: fTraslado,
          clienteId: cliente.id, status: 'facturado', type: 'mp_a_proceso', createdById: user.id, createdAt: tTraslado,
        },
      });
      for (const c of traslado.canales) {
        const p = piezaPorCodigo.get(c.codigo);
        if (!p) throw new Error(`La canal ${c.codigo} del traslado no está en los reportes de beneficio.`);
        if (Math.abs(p.x.pec - c.caliente) > 0.01) throw new Error(`Peso caliente distinto para ${c.codigo}.`);
        await tx.dispatchOrderItem.create({
          data: {
            dispatchOrderId: od.id, canalPiezaId: p.pieza.id, cavaOrigen: p.pieza.cava, pesoCalienteKg: c.caliente,
            despachoKg: c.frio, createdById: user.id, createdAt: tTraslado,
          },
        });
        await tx.canalPieza.update({ where: { id: p.pieza.id }, data: { cava: null } });
      }

      // Desposte (Orden de Producción + Rotulado).
      const fDesposte = dia(desposte.fechaDesposte);
      const tDesposte = new Date(`${desposte.fechaDesposte}T08:00:00-05:00`);
      let tienda = cliente.tiendas[0];
      if (!tienda) {
        tienda = await tx.clienteTienda.create({
          data: { clienteId: cliente.id, codigo: '01', nombre: cliente.concepto, ciudad: cliente.ciudad },
        });
      }
      const op = await tx.productionOrder.create({
        data: {
          plantId, opNumber: await sig('productionOrder', 'opNumber'), registrationDate: fDesposte, processDate: fDesposte,
          clienteId: cliente.id, dispatchOrderId: od.id, status: 'facturado', createdById: user.id, createdAt: tDesposte,
        },
      });
      await tx.productionOrderTienda.create({
        data: { productionOrderId: op.id, tiendaId: tienda.id, cantidad: traslado.canales.length, createdById: user.id, createdAt: tDesposte },
      });

      const seq = await tx.codigoBarrasSecuencia.findUnique({ where: { plantId } });
      let codigoN = seq?.ultimo ?? 0;
      const porProducto = new Map();
      for (const [i, r] of desposte.piezas.entries()) {
        const prod = productos.get(r.producto);
        const n = (porProducto.get(prod.id) ?? 0) + 1;
        porProducto.set(prod.id, n);
        const cp = pp.get(prod.id);
        const nombre = prod.nombre.toUpperCase();
        const congelado = /\bCONG/.test(nombre) || (cp ? cp.refrigeradoDias === 0 && cp.congeladoDias > 0 : false);
        const dias = cp ? (congelado ? cp.congeladoDias : cp.refrigeradoDias) : 0;
        const t = new Date(tDesposte.getTime() + i * 60_000);
        const codigoEtiqueta = codigoDesdeSecuencia(++codigoN);
        const canastilla = await tx.rotuladoCanastilla.create({
          data: {
            plantId, productionOrderId: op.id, productId: prod.id, tiendaId: tienda.id, numero: n,
            codigo: codigoDesdeSecuencia(++codigoN), taraKg: 0, brutoKg: r.kg, netoKg: r.kg, unds: r.unds,
            cerradaAt: t, cerradaById: user.id, createdById: user.id, createdAt: t,
          },
        });
        await tx.rotuladoEtiqueta.create({
          data: {
            plantId, productionOrderId: op.id, productId: prod.id, tiendaId: tienda.id,
            bodegaId: cliente.bodegas[0]?.id ?? null, pieza: n, codigo: codigoEtiqueta,
            taraKg: 0, brutoKg: r.kg, netoKg: r.kg,
            empaque: nombre.includes('VACIO') ? 'AL VACIO' : 'A GRANEL',
            conservacion: congelado ? 'congelado' : 'refrigerado',
            temperatura: cp ? (congelado ? cp.congeladoTemp : cp.refrigeradoTemp) : congelado ? '-18°C A -25°C' : '0°C A 4°C',
            fechaSacrificio: diaProceso, fechaEmpaque: fDesposte,
            fechaVencimiento: dias ? new Date(fDesposte.getTime() + dias * 86_400_000) : null,
            ref: r.barcode.replace(/\D/g, ''), impresa: true, canastillaId: canastilla.id,
            createdById: user.id, createdAt: t,
          },
        });
      }
      for (const [productId, ultimo] of porProducto) {
        await tx.rotuladoConsecutivo.create({ data: { plantId, productionOrderId: op.id, productId, ultimo } });
      }
      await tx.codigoBarrasSecuencia.upsert({ where: { plantId }, create: { plantId, ultimo: codigoN }, update: { ultimo: codigoN } });

      return { bc, bp, ordenes: ordenes.map((o) => o.reference), od: od.odNumber, op: op.opNumber, animales: todos.length };
    },
    { timeout: 120_000 },
  );

  const kgEtiquetas = desposte.piezas.reduce((s, p) => s + p.kg, 0);
  const kgFrio = traslado.canales.reduce((s, c) => s + c.frio, 0);
  console.log(`BC${resumen.bc} / BP${resumen.bp}: ${resumen.animales} animales, guía ${guia}`);
  console.log(`Órdenes de beneficio ${fecha}: ${resumen.ordenes.join(', ')} (lotes FrigoAPP ${lotes.map((l) => l.lote).join(', ')})`);
  console.log(`OD${resumen.od}: ${traslado.canales.length} canales, ${kgFrio.toFixed(2)} kg en frío (traslado FrigoAPP ${traslado.numero})`);
  console.log(`OP${resumen.op}: ${desposte.piezas.length} etiquetas, ${kgEtiquetas.toFixed(2)} kg (desposte FrigoAPP ${desposte.op})`);
  const sinTrasladar = [...lotes.flatMap((l) => l.animales)].filter((x) => !traslado.canales.some((c) => c.codigo === x.codigo));
  if (sinTrasladar.length) console.log(`Canales que quedan en CAVA 1 (no fueron al desposte): ${sinTrasladar.map((x) => x.codigo).join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
