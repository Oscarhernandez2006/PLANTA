#!/usr/bin/env node
/**
 * Escenario simulado de punta a punta usando la API real (no inserta en la BD).
 *
 *   Guía camión → Peso en pie → Orden de beneficio → Sacrificio → Canal caliente
 *   → Pieles → Orden de despacho (canal a producción) → Orden de producción
 *   → Rotulado (desposte con N productos) → Informes.
 *
 * Uso:
 *   API_URL=http://localhost:3001/api node scripts/seed-escenario-desposte.cjs
 *
 * Variables opcionales: ADMIN_CEDULA (1044616409), ADMIN_PIN (6409),
 * PRODUCTOS (cantidad de productos a despostar, 8), PESO_CANAL (kg, 285),
 * OP_ID (uuid de una OP ya creada: salta directo al rotulado).
 */
const API = (process.env.API_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');
const CEDULA = process.env.ADMIN_CEDULA ?? '1044616409';
const PIN = process.env.ADMIN_PIN ?? '6409';
const N_PRODUCTOS = Number(process.env.PRODUCTOS ?? 8);
const PESO_CANAL = Number(process.env.PESO_CANAL ?? 285);

let token = '';
const hoy = new Date().toISOString().slice(0, 10);

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data === 'object' && data ? data.message : data;
    throw new Error(`${method} ${path} → ${res.status}: ${Array.isArray(msg) ? msg.join(' | ') : msg}`);
  }
  return data;
}

const paso = (n, msg) => console.log(`\n[${n}] ${msg}`);
const ok = (msg) => console.log(`    ✓ ${msg}`);
const redondear = (n) => Math.round(n * 100) / 100;

async function main() {
  paso(0, `Login en ${API}`);
  token = (await api('POST', '/auth/login', { documentId: CEDULA, pin: PIN })).accessToken;
  ok('autenticado');

  // --- Catálogos ---------------------------------------------------------
  paso(1, 'Catálogos (cliente, tienda, bodega, productos)');
  const clientes = await api('GET', '/clientes');
  const cliente = (Array.isArray(clientes) ? clientes : clientes.items)[0];
  if (!cliente) throw new Error('No hay clientes. Corra el seed primero.');
  ok(`cliente ${cliente.concepto} (${cliente.id})`);

  let tiendas = await api('GET', `/clientes/${cliente.id}/tiendas`);
  if (!tiendas.length) {
    tiendas = [
      await api('POST', `/clientes/${cliente.id}/tiendas`, { nombre: 'TIENDA PRINCIPAL', ciudad: 'BOGOTÁ' }),
    ];
  }
  const tienda = tiendas[0];
  ok(`tienda ${tienda.codigo} - ${tienda.nombre}`);

  const bodegas = await api('GET', `/clientes/${cliente.id}/bodegas`);
  const bodega = bodegas[0] ?? null;
  if (bodega) ok(`bodega ${bodega.code ?? bodega.codigo} - ${bodega.nombre}`);

  // La respuesta trae el producto aplanado: { id, codigo, nombre, piezasPorCanal, ... }
  const productosDesposte = (await api('GET', `/conservacion/clientes/${cliente.id}/productos`))
    .filter((cp) => (cp.piezasPorCanal ?? 0) > 0 && cp.active !== false)
    .slice(0, N_PRODUCTOS);
  if (!productosDesposte.length) throw new Error('El cliente no tiene productos de desposte (cliente_producto).');
  ok(`${productosDesposte.length} productos de desposte seleccionados`);

  let ob, animal, od, op, barcode;
  if (process.env.OP_ID) {
    op = await api('GET', `/production-orders/${process.env.OP_ID}`);
    ok(`reanudando rotulado sobre OP${op.opNumber}`);
  } else {
  // --- Peso en camión -----------------------------------------------------
  paso(2, 'Peso en camión (guía con 1 animal)');
  const guia = await api('POST', '/peso-camion', {
    date: hoy,
    guia: `SIM-${Date.now().toString().slice(-6)}`,
    referenciaLote: 'LOTE SIMULADO',
    procedencia: 'FINCA LA ESPERANZA',
    proveedor: 'PROVEEDOR PRUEBA',
    cliente: cliente.concepto,
    placa: 'ABC123',
    conductor: 'CONDUCTOR PRUEBA',
    cantidad: 1,
    entrada: 12480,
    salida: 11990,
    neto: 490,
    observaciones: 'ESCENARIO SIMULADO PARA PRUEBAS DE INFORMES',
  });
  await api('PATCH', `/peso-camion/${guia.id}/close`);
  ok(`guía ${guia.guia} cerrada (neto ${12480 - 11990} kg)`);

  // --- Peso en pie --------------------------------------------------------
  paso(3, 'Peso en pie (promediado)');
  await api('POST', '/peso-en-pie/promediado', {
    pesoCamionId: guia.id,
    corral: '1',
    tipoAnimal: 'NOVILLO',
  });
  await api(
    'PATCH',
    `/peso-en-pie/close-guide?date=${hoy}&guia=${encodeURIComponent(guia.guia)}`,
  ).catch((e) => console.log('    (close-guide)', e.message));
  ok('animal pesado en pie y guía cerrada para beneficio');

  // --- Orden de beneficio -------------------------------------------------
  paso(4, 'Orden de beneficio');
  ob = await api('POST', '/orden-beneficio', {
    date: hoy,
    cliente: cliente.concepto,
    guia: guia.guia,
    observaciones: 'ORDEN SIMULADA',
  });
  ok(`OB${ob.reference} creada (${ob.animalCount ?? 1} animal)`);

  // --- Sacrificio ---------------------------------------------------------
  paso(5, 'Sacrificio / insensibilización');
  const evento = await api('POST', `/sacrificio/${ob.id}/stun`, { sequence: 1 });
  await api('PATCH', `/sacrificio/${ob.id}/cerrar`);
  ok(`animal insensibilizado (evento ${evento.id ?? evento.eventoId}), orden cerrada en Sacrificio`);

  // --- Canal caliente -----------------------------------------------------
  paso(6, 'Canal caliente');
  const animales = await api('GET', '/canal-caliente/animales');
  animal = animales.find((a) => a.reference === ob.reference);
  if (!animal) throw new Error('No aparece el animal en Canal Caliente.');
  await api('PATCH', `/canal-caliente/animales/${animal.eventoId}/tipo`, { tipo: 'canal_completa' });
  await api('PATCH', `/canal-caliente/animales/${animal.eventoId}`, { tipo: 'novillo' }).catch(() => {});
  const pieza = await api('POST', '/canal-caliente', {
    eventoId: animal.eventoId,
    pieza: 'canal',
    pesoKg: PESO_CANAL,
  });
  const piezaId = pieza.id ?? pieza.piezaId ?? pieza.pieza?.id;
  await api('PATCH', `/canal-caliente/piezas/${piezaId}`, { cava: 1 }).catch((e) => console.log('    (cava)', e.message));
  await api('PATCH', `/canal-caliente/lotes/${ob.id}/cerrar`);
  ok(`canal completa ${PESO_CANAL} kg registrada en cava 1, orden cerrada en Canal Caliente`);

  // --- Pieles -------------------------------------------------------------
  paso(7, 'Pieles');
  await api('POST', '/pieles', { eventoId: animal.eventoId, pesoKg: 32.5 });
  await api('PATCH', `/pieles/lotes/${ob.id}/cerrar`);
  ok('piel pesada (32,5 kg), orden cerrada en Pieles');

  // --- Orden de despacho a producción ------------------------------------
  paso(8, 'Orden de despacho (canal a producción)');
  od = await api('POST', '/dispatch-orders', {
    clienteId: cliente.id,
    registrationDate: hoy,
    processDate: hoy,
  });
  barcode = `${ob.reference}-${animal.consecutivo}1`;
  await api('POST', `/dispatch-orders/${od.id}/items`, { barcode, despachoKg: PESO_CANAL - 4 });
  await api('PATCH', `/dispatch-orders/${od.id}/cerrar`).catch((e) => console.log('    (cerrar OD)', e.message));
  ok(`OD${od.odNumber} con la canal ${barcode}`);

  // --- Orden de producción + rotulado ------------------------------------
  paso(9, 'Orden de producción y rotulado');
  op = await api('POST', '/production-orders', {
    clienteId: cliente.id,
    dispatchOrderId: od.id,
    registrationDate: hoy,
    processDate: hoy,
  });
  await api('POST', `/production-orders/${op.id}/preparacion`, { tiendaId: tienda.id, cantidad: 1 });
  ok(`OP${op.opNumber} creada, tienda ${tienda.codigo} con 1 canal`);
  }

  const vence = new Date();
  vence.setDate(vence.getDate() + 45);
  let etiquetas = 0;
  let netoTotal = 0;
  for (const cp of productosDesposte) {
    const productId = cp.id;
    const nombre = cp.nombre;
    // Reanudable: salta lo que ya está etiquetado y hace solo las piezas que faltan.
    const estado = await api('GET', `/production-orders/${op.id}/rotulado/estado?productId=${productId}`);
    const t = estado.tiendas.find((x) => x.tiendaId === tienda.id);
    const piezas = Math.max((t?.requeridas ?? cp.piezasPorCanal ?? 1) - (t?.etiquetadas ?? 0), 0);
    if (!piezas) continue;
    for (let i = 0; i < piezas; i++) {
      const reserva = await api('POST', `/production-orders/${op.id}/etiquetas/reservar`, {
        productId,
        tiendaId: tienda.id,
        taraKg: 0.05,
        estacion: 'DBOVINO1',
      });
      const neto = redondear(2 + Math.random() * 6);
      await api('POST', `/production-orders/${op.id}/etiquetas`, {
        productId,
        tiendaId: tienda.id,
        bodegaId: bodega?.id,
        pieza: reserva.pieza,
        codigo: reserva.codigo,
        taraKg: 0.05,
        brutoKg: redondear(neto + 0.05),
        netoKg: neto,
        empaque: 'AL VACIO',
        conservacion: 'refrigerado',
        temperatura: cp.refrigeradoTemp ?? '0°C A 4°C',
        fechaSacrificio: hoy,
        fechaEmpaque: hoy,
        fechaVencimiento: vence.toISOString().slice(0, 10),
        procesadoPara: cliente.concepto,
        impresa: true,
        estacion: 'DBOVINO1',
      });
      etiquetas++;
      netoTotal += neto;
    }
    console.log(`    · ${nombre}: ${piezas} pza(s)`);
  }
  ok(`${etiquetas} etiquetas, ${redondear(netoTotal)} kg netos`);

  // --- Informes -----------------------------------------------------------
  paso(10, 'Verificación de informes');
  for (const ruta of [
    ...(ob
      ? [`/informes/sacrificio/${ob.id}`, `/informes/canal-caliente/${ob.id}`, `/informes/proceso-general/${ob.id}`]
      : []),
    `/informes/produccion/${op.id}`,
  ]) {
    try {
      const r = await api('GET', ruta);
      ok(`${ruta} → ${JSON.stringify(r).length} bytes`);
    } catch (e) {
      console.log(`    ✗ ${ruta}: ${e.message}`);
    }
  }

  console.log(ob ? `\nListo. Datos: OB${ob.reference} · canal ${barcode} · OD${od.odNumber} · OP${op.opNumber}` : `\nListo. OP${op.opNumber} rotulada.`);
}

main().catch((e) => {
  console.error('\nERROR:', e.message);
  process.exit(1);
});
