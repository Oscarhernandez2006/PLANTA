#!/usr/bin/env node
/**
 * Escenario DEMO para mostrar todos los módulos, usando la API real (aplica todas las reglas).
 * Correr sobre una BD sin movimientos (reset-transactional-data.cjs --yes).
 *
 *   API_URL=http://localhost:3000/api node scripts/seed-demo.cjs
 */
const API = (process.env.API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
const CEDULA = process.env.ADMIN_CEDULA ?? '1044616409';
const PIN = process.env.ADMIN_PIN ?? '6409';
const SUP = { fullName: 'SUPERVISOR DEMO', documentId: '1000000001', pin: '1234' };
const CLIENTE = process.env.CLIENTE ?? 'AGROPECUARIA SANTACRUZ';

let token = '';

/** Día de planta (America/Bogota, jornada desde las 5:00). */
function diaPlanta(offsetDias = 0) {
  const d = new Date(Date.now() - 5 * 3600_000 + offsetDias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
}
const hoy = diaPlanta();
const masDias = (n) => {
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

const resumen = [];
const paso = (msg) => console.log(`\n== ${msg}`);
const ok = (msg) => {
  console.log(`   ✓ ${msg}`);
  resumen.push(msg);
};
const aviso = (msg) => console.log(`   ! ${msg}`);
const r2 = (n) => Math.round(n * 100) / 100;
const azar = (min, max) => r2(min + Math.random() * (max - min));
const SUFIJO = { canal: '1', cizq: '2I', cder: '3D' };

async function intentar(desc, fn) {
  try {
    return await fn();
  } catch (e) {
    aviso(`${desc}: ${e.message}`);
    return null;
  }
}

/** Guía de camión + pesos en pie individuales; deja la guía lista para beneficio. */
async function guiaConPesos({ guia, lote, procedencia, proveedor, placa, conductor, pesos, tipos, cerrar = true }) {
  const neto = Math.ceil(pesos.reduce((s, p) => s + p, 0) + 40);
  const entrada = 9000 + neto;
  const camion = await api('POST', '/peso-camion', {
    date: hoy,
    guia,
    referenciaLote: lote,
    procedencia,
    proveedor,
    cliente: CLIENTE,
    placa,
    conductor,
    cantidad: pesos.length,
    entrada,
    salida: 9000,
    neto,
    observaciones: `DEMO: ${pesos.length} ANIMALES, DESEMBARQUE SIN NOVEDAD.`,
  });
  if (!cerrar) return camion;
  await api('PATCH', `/peso-camion/${camion.id}/close`);
  for (let i = 0; i < pesos.length; i++) {
    await api('POST', '/peso-en-pie', {
      animalCount: 1,
      tipoPesaje: 'individual',
      pesoTotalKg: pesos[i],
      date: hoy,
      guia,
      bcReference: camion.reference,
      cliente: CLIENTE,
      procedencia,
      proveedor,
      placa,
      conductor,
      corral: String(1 + (i % 3)),
      tipoAnimal: tipos[i % tipos.length],
      lote,
    });
  }
  await api('PATCH', `/peso-camion/${camion.id}/close-pie`);
  await intentar('close-guide', () => api('PATCH', `/peso-en-pie/close-guide?date=${hoy}&guia=${encodeURIComponent(guia)}`));
  return camion;
}

async function main() {
  console.log(`API ${API} · día de planta ${hoy}`);
  token = (await api('POST', '/auth/login', { documentId: CEDULA, pin: PIN })).accessToken;

  // --- Supervisor demo (para cierres con PIN) ---------------------------
  paso('Supervisor demo');
  await intentar('crear supervisor', async () => {
    await api('POST', '/usuarios', { ...SUP, role: 'supervisor' });
    ok(`Usuario supervisor ${SUP.fullName} · cédula ${SUP.documentId} · PIN ${SUP.pin}`);
  });

  // --- Catálogos --------------------------------------------------------
  paso('Catálogos');
  const clientes = await api('GET', '/clientes');
  const cliente = clientes.find((c) => c.concepto === CLIENTE) ?? clientes[0];
  if (!cliente) throw new Error('No hay clientes.');
  let tiendas = (await api('GET', `/clientes/${cliente.id}/tiendas`)).filter((t) => t.active);
  if (!tiendas.length) tiendas = [await api('POST', `/clientes/${cliente.id}/tiendas`, { nombre: 'TIENDA PRINCIPAL', ciudad: 'BARRANQUILLA' })];
  const tienda = tiendas[0];
  let bodegas = (await api('GET', `/clientes/${cliente.id}/bodegas`)).filter((b) => b.active);
  if (!bodegas.length) bodegas = [await api('POST', `/clientes/${cliente.id}/bodegas`, { nombre: cliente.concepto })];
  const bodega = bodegas[0];
  const productos = (await api('GET', `/conservacion/clientes/${cliente.id}/productos`)).filter((p) => p.active !== false && p.piezasPorCanal > 0);
  if (!productos.length) throw new Error('El cliente no tiene productos configurados en Conservación.');
  console.log(`   cliente ${cliente.concepto} · tienda ${tienda.nombre} · bodega ${bodega.nombre} · ${productos.length} productos`);
  const orden = { clienteId: cliente.id, registrationDate: hoy, processDate: hoy };

  // --- Peso en camión / Peso en pie ------------------------------------
  paso('Peso en camión y peso en pie');
  const sufijo = Date.now().toString().slice(-5);
  const pesosA = [468, 512, 455, 497, 431, 489, 476, 503];
  const camA = await guiaConPesos({
    guia: `16${sufijo}1`,
    lote: 'LF-0420',
    procedencia: 'LAS FLORES',
    proveedor: 'GILBERTO SERRANO QUINTERO',
    placa: 'TKR615',
    conductor: 'CARLOS PEREZ',
    pesos: pesosA,
    tipos: ['NOVILLO', 'NOVILLO', 'TORO', 'NOVILLO'],
  });
  ok(`Guía ${camA.guia} (BC${camA.reference}) cerrada con 8 animales pesados en pie`);
  const pesosB = [442, 468, 451, 437];
  const camB = await guiaConPesos({
    guia: `16${sufijo}2`,
    lote: 'LF-0421',
    procedencia: 'EL PORVENIR',
    proveedor: 'GANADERIA EL PORVENIR',
    placa: 'SXT482',
    conductor: 'JUAN MARTINEZ',
    pesos: pesosB,
    tipos: ['VACA', 'NOVILLA'],
  });
  ok(`Guía ${camB.guia} (BC${camB.reference}) cerrada con 4 animales pesados en pie`);
  const camC = await guiaConPesos({
    guia: `16${sufijo}3`,
    lote: 'LF-0422',
    procedencia: 'SANTA ROSA',
    proveedor: 'HACIENDA SANTA ROSA',
    placa: 'WMN731',
    conductor: 'PEDRO GOMEZ',
    pesos: [470, 480, 490],
    tipos: ['NOVILLO'],
    cerrar: false,
  });
  ok(`Guía ${camC.guia} (BC${camC.reference}) ABIERTA para continuarla en Peso en Camión / Peso en Pie`);

  // --- Orden de beneficio + sacrificio ----------------------------------
  paso('Orden de beneficio y sacrificio');
  const obA = await api('POST', '/orden-beneficio', { cliente: CLIENTE, guia: camA.guia, date: hoy, observaciones: 'ORDEN DEMO' });
  const obB = await api('POST', '/orden-beneficio', { cliente: CLIENTE, guia: camB.guia, date: hoy, observaciones: 'ORDEN DEMO' });
  for (const ob of [obA, obB]) {
    for (let s = 1; s <= ob.animalCount; s++) await api('POST', `/sacrificio/${ob.id}/stun`, { sequence: s });
    await api('PATCH', `/sacrificio/${ob.id}/cerrar`);
  }
  ok(`OB${obA.reference} (${obA.animalCount} animales) y OB${obB.reference} (${obB.animalCount}) sacrificadas y cerradas en Sacrificio`);

  // --- Pieles -----------------------------------------------------------
  paso('Pieles');
  const pielA = await api('GET', `/pieles/lotes/${obA.id}`);
  for (const a of pielA.animales) await api('POST', '/pieles', { eventoId: a.eventoId, pesoKg: azar(28, 38) });
  await api('PATCH', `/pieles/lotes/${obA.id}/cerrar`);
  const pielB = await api('GET', `/pieles/lotes/${obB.id}`);
  for (const a of pielB.animales.slice(0, 2)) await api('POST', '/pieles', { eventoId: a.eventoId, pesoKg: azar(26, 34) });
  ok(`Pieles: OB${obA.reference} completa y cerrada; OB${obB.reference} con 2 de 4 pesadas (en proceso)`);

  // --- Canal caliente ---------------------------------------------------
  paso('Canal caliente');
  const piezas = []; // { barcode, piezaId, pesoKg, animal, pieza }
  const loteA = await api('GET', `/canal-caliente/lotes/${obA.id}`);
  const animalesA = [...loteA.animales].sort((a, b) => a.sequence - b.sequence);
  const TIPOS = ['novillo', 'novillo', 'toro', 'novillo', 'vaca', 'novillo', 'toro', 'novillo'];
  for (let i = 0; i < animalesA.length; i++) {
    const a = animalesA[i];
    const media = i % 2 === 0; // animales 1,3,5,7 en media canal
    await api('PATCH', `/canal-caliente/animales/${a.eventoId}/tipo`, { tipo: media ? 'media_canal' : 'canal_completa' });
    await api('PATCH', `/canal-caliente/animales/${a.eventoId}`, { tipo: TIPOS[i], expendio: 'AGROPECUARIA SANTACRUZ' });
    const canal = r2(pesosA[i] * azar(0.54, 0.58));
    const lista = media
      ? [
          ['cizq', r2(canal / 2 + 1.2)],
          ['cder', r2(canal / 2 - 1.2)],
        ]
      : [['canal', canal]];
    for (const [pieza, pesoKg] of lista) {
      const r = await api('POST', '/canal-caliente', { eventoId: a.eventoId, pieza, pesoKg });
      const cava = i < 4 ? 'CAVA 1' : 'CAVA 2';
      await api('PATCH', `/canal-caliente/piezas/${r.piezaId}`, { cava, bodega: CLIENTE, destino: CLIENTE });
      piezas.push({ barcode: `${obA.reference}-${a.consecutivo}${SUFIJO[pieza]}`, piezaId: r.piezaId, pesoKg, animal: i + 1, pieza });
    }
  }
  await api('PATCH', `/canal-caliente/lotes/${obA.id}/cerrar`);
  ok(`Canal caliente OB${obA.reference}: ${piezas.length} piezas (4 animales en media canal, 4 en canal completa), cerrada`);
  const loteB = await api('GET', `/canal-caliente/lotes/${obB.id}`);
  const animalesB = [...loteB.animales].sort((a, b) => a.sequence - b.sequence);
  for (let i = 0; i < 2; i++) {
    const a = animalesB[i];
    await api('PATCH', `/canal-caliente/animales/${a.eventoId}/tipo`, { tipo: 'canal_completa' });
    await api('PATCH', `/canal-caliente/animales/${a.eventoId}`, { tipo: i ? 'novilla' : 'vaca', expendio: 'AGROPECUARIA SANTACRUZ' });
    const r = await api('POST', '/canal-caliente', { eventoId: a.eventoId, pieza: 'canal', pesoKg: r2(pesosB[i] * 0.55) });
    await api('PATCH', `/canal-caliente/piezas/${r.piezaId}`, { cava: 'CAVA 3', bodega: CLIENTE, destino: CLIENTE });
  }
  ok(`Canal caliente OB${obB.reference}: 2 de 4 animales pesados (abierta para continuar)`);

  const de = (animal) => piezas.filter((p) => p.animal === animal);
  // Movimiento de cava: una media canal del animal 7 pasa a CAVA 4.
  await intentar('mover cava', async () => {
    await api('PATCH', `/canal-caliente/piezas/${de(7)[0].piezaId}`, { cava: 'CAVA 4' });
    ok(`Canal ${de(7)[0].barcode} movida a CAVA 4`);
  });

  // --- Canal fría: orden de despacho a proceso --------------------------
  paso('Canal fría (orden de despacho a proceso)');
  const od1 = await api('POST', '/dispatch-orders', orden);
  for (const p of [...de(1), ...de(2), ...de(4)]) {
    await api('POST', `/dispatch-orders/${od1.id}/items`, { barcode: p.barcode, despachoKg: r2(p.pesoKg * 0.982) });
  }
  await api('PATCH', `/dispatch-orders/${od1.id}/cerrar`);
  ok(`OD${od1.odNumber} cerrada con 4 piezas (animales 1, 2 y 4) pesadas en frío`);
  const od2 = await api('POST', '/dispatch-orders', orden);
  await api('POST', `/dispatch-orders/${od2.id}/items`, { barcode: de(6)[0].barcode, despachoKg: r2(de(6)[0].pesoKg * 0.98) });
  ok(`OD${od2.odNumber} ACTIVA con 1 canal (para continuar en Canal Fría)`);

  // --- Orden de producción + rotulado desposte -------------------------
  paso('Orden de producción y rotulado desposte');
  const op = await api('POST', '/production-orders', { ...orden, dispatchOrderId: od1.id });
  const prep = await api('GET', `/production-orders/${op.id}/preparacion`);
  await api('POST', `/production-orders/${op.id}/preparacion`, { tiendaId: tienda.id, cantidad: Math.max(1, prep.disponibles ?? prep.totalCanales ?? 1) });
  const etiquetas = [];
  const vence = masDias(21);
  for (const prod of productos.slice(0, 8)) {
    const estado = await api('GET', `/production-orders/${op.id}/rotulado/estado?productId=${prod.id}`);
    const t = estado.tiendas.find((x) => x.tiendaId === tienda.id);
    const n = Math.min(Math.max((t?.requeridas ?? 0) - (t?.etiquetadas ?? 0), 0), 4);
    const cerrarLlena = async (forzar) => {
      const st = await api('GET', `/production-orders/${op.id}/rotulado/estado?productId=${prod.id}`);
      const c = st.canastilla;
      if (c?.id && c.unds > 0 && (forzar || c.unds >= st.capacidadCanastilla)) {
        await api('POST', `/production-orders/canastillas/${c.id}/cerrar`, {});
      }
    };
    for (let i = 0; i < n; i++) {
      await cerrarLlena(false);
      const tara = 0.05;
      const reserva = await api('POST', `/production-orders/${op.id}/etiquetas/reservar`, { productId: prod.id, tiendaId: tienda.id, taraKg: tara, estacion: 'DBOVINO1' });
      const neto = azar(2.2, 9.5);
      const e = await api('POST', `/production-orders/${op.id}/etiquetas`, {
        productId: prod.id,
        tiendaId: tienda.id,
        bodegaId: bodega.id,
        pieza: reserva.pieza,
        codigo: reserva.codigo,
        taraKg: tara,
        brutoKg: r2(neto + tara),
        netoKg: neto,
        empaque: 'AL VACIO',
        conservacion: 'refrigerado',
        temperatura: prod.refrigeradoTemp || '0°C A 4°C',
        fechaSacrificio: hoy,
        fechaEmpaque: hoy,
        fechaVencimiento: prod.refrigeradoDias > 0 ? masDias(prod.refrigeradoDias) : vence,
        procesadoPara: CLIENTE,
        impresa: true,
        estacion: 'DBOVINO1',
      });
      etiquetas.push({ ...e, neto, nombre: prod.nombre });
    }
    if (n) await cerrarLlena(true);
  }
  ok(`OP${op.opNumber} (de OD${od1.odNumber}) ACTIVA con ${etiquetas.length} etiquetas rotuladas de ${new Set(etiquetas.map((e) => e.nombre)).size} productos`);

  // --- Traslado + acondicionamiento ------------------------------------
  paso('Traslado y acondicionamiento');
  const ot1 = await api('POST', '/transfer-orders', orden);
  const aTrasladar = etiquetas.slice(0, 3);
  for (const e of aTrasladar) {
    await api('POST', `/transfer-orders/${ot1.id}/items`, { codigo: e.codigo, pesoKg: r2(e.neto + 0.05 - 0.02), taraKg: 0.05 });
  }
  await api('PATCH', `/transfer-orders/${ot1.id}/cerrar`);
  ok(`OT${ot1.otNumber} cerrada con ${aTrasladar.length} productos trasladados`);
  const ot2 = await api('POST', '/transfer-orders', orden);
  ok(`OT${ot2.otNumber} ACTIVA vacía (para pistolear en Traslado)`);

  const oc = await intentar('crear OC', () => api('POST', '/conditioning-orders', { ...orden, transferOrderId: ot1.id, proceso: 'porcionado' }));
  if (oc) {
    let n = 0;
    for (const prod of productos.slice(0, 3)) {
      const neto = azar(1.5, 4.5);
      const r = await intentar('etiqueta acondicionamiento', () =>
        api('POST', `/conditioning-orders/${oc.id}/etiquetas`, {
          productId: prod.id,
          tiendaId: tienda.id,
          bodegaId: bodega.id,
          taraKg: 0.03,
          brutoKg: r2(neto + 0.03),
          netoKg: neto,
          empaque: 'AL VACIO',
          conservacion: 'refrigerado',
          temperatura: prod.refrigeradoTemp || '0°C A 4°C',
          fechaEmpaque: hoy,
          fechaVencimiento: vence,
          procesadoPara: CLIENTE,
          impresa: true,
          estacion: 'DBOVINO1',
        }),
      );
      if (r) n++;
    }
    ok(`OC${oc.ocNumber} (porcionado, de OT${ot1.otNumber}) ACTIVA con ${n} etiquetas de acondicionamiento`);
  }

  // --- Despachos de canales y posta -------------------------------------
  paso('Despachos');
  const dcC = await api('POST', '/canal-dispatch-orders', { ...orden, tipo: 'caliente' });
  for (const p of de(3)) {
    const it = await api('POST', `/canal-dispatch-orders/${dcC.id}/items`, { barcode: p.barcode });
    await api('PATCH', `/canal-dispatch-orders/items/${it.itemId}`, { despachoKg: r2(p.pesoKg - 0.4) });
  }
  await api('PATCH', `/canal-dispatch-orders/${dcC.id}/cerrar`);
  ok(`DC${dcC.dcNumber} despacho CALIENTE cerrado (animal 3, media canal)`);
  const dcF = await api('POST', '/canal-dispatch-orders', { ...orden, tipo: 'frio' });
  for (const p of de(8)) {
    const it = await api('POST', `/canal-dispatch-orders/${dcF.id}/items`, { barcode: p.barcode });
    await api('PATCH', `/canal-dispatch-orders/items/${it.itemId}`, { despachoKg: r2(p.pesoKg * 0.98) });
  }
  ok(`DC${dcF.dcNumber} despacho FRÍO ACTIVO (animal 8)`);
  const dcP = await api('POST', '/canal-dispatch-orders', { ...orden, tipo: 'posta' });
  let posta = 0;
  for (const e of etiquetas.slice(3, 6)) {
    const r = await intentar('despacho posta', () =>
      api('POST', `/canal-dispatch-orders/${dcP.id}/productos`, { codigo: e.codigo, pesoKg: r2(e.neto + 0.05), taraKg: 0.05 }),
    );
    if (r) posta++;
  }
  ok(`DC${dcP.dcNumber} despacho POSTA ACTIVO con ${posta} productos`);

  // --- Recibos ----------------------------------------------------------
  paso('Recibo de canales y recibo en posta');
  const pin = { pin: SUP.pin };
  const rc1 = await api('POST', '/canal-receipts', orden);
  for (let i = 1; i <= 3; i++) {
    await api('POST', `/canal-receipts/${rc1.id}/items`, { cava: 5, pesoKg: azar(118, 142), guia: `R${sufijo}${i}`, lote: 'EXT-77', identificacion: `ARETE ${4400 + i}` });
  }
  const rcCerrado = await intentar('cerrar RC', () => api('PATCH', `/canal-receipts/${rc1.id}/cerrar`, { ...pin, bodegaId: bodega.id }));
  ok(`RC${rc1.receiptNumber} con 3 canales recibidas${rcCerrado ? ', cerrado e ingresado a la bodega' : ' (no se pudo cerrar)'}`);
  const rc2 = await api('POST', '/canal-receipts', orden);
  for (let i = 1; i <= 2; i++) {
    await api('POST', `/canal-receipts/${rc2.id}/items`, { cava: 5, pesoKg: azar(118, 142), guia: `R${sufijo}9`, lote: 'EXT-78', identificacion: `ARETE ${4500 + i}` });
  }
  ok(`RC${rc2.receiptNumber} ACTIVO con 2 canales (para continuar en Recibo de Canales)`);

  const rp1 = await api('POST', '/posta-receipts', orden);
  for (const prod of productos.slice(0, 3)) {
    const bruto = azar(18, 32);
    await api('POST', `/posta-receipts/${rp1.id}/items`, {
      productId: prod.id,
      taraKg: 0.6,
      brutoKg: bruto,
      piezas: Math.round(azar(4, 10)),
      empaques: 1,
      lote: 'POSTA-12',
      conservacion: 'refrigerado',
      fechaSacrificio: masDias(-1),
      fechaVencimiento: masDias(15),
    });
  }
  const rpCerrado = await intentar('cerrar RP', () => api('PATCH', `/posta-receipts/${rp1.id}/cerrar`, { ...pin, bodegaId: bodega.id }));
  ok(`RP${rp1.receiptNumber} con 3 productos${rpCerrado ? ', cerrado e ingresado a la bodega' : ' (no se pudo cerrar)'}`);
  const rp2 = await api('POST', '/posta-receipts', orden);
  await api('POST', `/posta-receipts/${rp2.id}/items`, {
    productId: productos[3 % productos.length].id,
    taraKg: 0.6,
    brutoKg: 21.4,
    piezas: 6,
    empaques: 1,
    lote: 'POSTA-13',
    conservacion: 'congelado',
    fechaSacrificio: masDias(-2),
    fechaVencimiento: masDias(90),
  });
  ok(`RP${rp2.receiptNumber} ACTIVO con 1 producto (para continuar en Recibo en Posta)`);

  // --- Informes ---------------------------------------------------------
  paso('Informes');
  for (const ruta of [
    `/informes/sacrificio/${obA.id}`,
    `/informes/canal-caliente/${obA.id}`,
    `/informes/proceso-general/${obA.id}`,
    `/informes/produccion/${op.id}`,
  ]) {
    await intentar(ruta, async () => {
      await api('GET', ruta);
      console.log(`   ✓ ${ruta}`);
    });
  }

  console.log('\n================ RESUMEN DEMO ================');
  for (const r of resumen) console.log(` • ${r}`);
  console.log(`\nCanales OB${obA.reference}: ${piezas.map((p) => p.barcode).join(', ')}`);
  console.log(`Etiquetas OP${op.opNumber}: ${etiquetas.map((e) => e.codigo).join(', ')}`);
}

main().catch((e) => {
  console.error('\nERROR:', e.message);
  process.exit(1);
});
