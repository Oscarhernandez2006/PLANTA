/* eslint-disable no-console */
// Cierra por la API real todas las canastillas abiertas de una OP (uso en datos simulados).
// Uso: OP_ID=<uuid> node scripts/cerrar-canastillas-op.cjs
const API_URL = process.env.API_URL ?? 'http://localhost:3001/api';
const OP_ID = process.env.OP_ID;
const CEDULA = process.env.ADMIN_CEDULA ?? '1044616409';
const PIN = process.env.ADMIN_PIN ?? '6409';

if (!OP_ID) {
  console.error('Falta OP_ID');
  process.exit(1);
}

async function req(method, path, body, token) {
  const r = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(data?.message ?? data)}`);
  return data;
}

(async () => {
  const { accessToken } = await req('POST', '/auth/login', { documentId: CEDULA, pin: PIN });
  const op = await req('GET', `/production-orders/${OP_ID}`, null, accessToken);
  const productos = await req('GET', `/conservacion/clientes/${op.cliente.id}/productos`, null, accessToken);
  const productIds = productos.map((p) => p.id);
  console.log(`Productos del cliente: ${productIds.length}`);

  let cerradas = 0;
  let yaCerradas = 0;
  for (const productId of productIds) {
    const estado = await req(
      'GET',
      `/production-orders/${OP_ID}/rotulado/estado?productId=${productId}`,
      null,
      accessToken,
    );
    const c = estado.canastilla;
    if (!c) continue;
    if (c.cerradaAt) {
      yaCerradas++;
      continue;
    }
    if (!c.unds) continue;
    await req('POST', `/production-orders/canastillas/${c.id}/cerrar`, {}, accessToken);
    cerradas++;
  }
  console.log(`Canastillas cerradas ahora: ${cerradas} · ya cerradas: ${yaCerradas}`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
