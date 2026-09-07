export interface ReciboData {
  guia: string;
  fecha: string;
  proveedor: string;
  procedencia: string;
  ciudad: string;
  cliente: string;
  referencia: string;
  placa: string;
  conductor: string;
  entrada: string;
  salida: string;
  neto: string;
  cantidad: string;
  prom: string;
  observaciones: string;
  operario: string;
  impreso: string;
  logoUrl: string;
}

function esc(s: string) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] as string,
  );
}

export function buildReciboHtml(d: ReciboData) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Recibo guía ${esc(d.guia) || ''}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    font-size: 11px;
    padding: 18px;
  }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #1f2937; padding: 4px 6px; vertical-align: middle; }
  .frame { border: 1px solid #1f2937; }
  .frame table td, .frame table th { border: 1px solid #1f2937; }
  .logo { width: 150px; text-align: center; }
  .logo img { max-width: 120px; max-height: 74px; object-fit: contain; }
  .company { text-align: center; line-height: 1.35; }
  .company .name { font-size: 13px; font-weight: 700; letter-spacing: .3px; }
  .title {
    text-align: center; font-weight: 700; font-size: 13px;
    background: #f3f4f6; letter-spacing: .3px; padding: 6px;
  }
  .lbl {
    text-align: center; font-weight: 700; font-size: 10px;
    background: #fbe9e9; color: #7f1d1d; text-transform: uppercase;
  }
  .val { text-align: center; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .center { text-align: center; }
  .grp { text-align: center; font-weight: 700; background: #f3f4f6; }
  .section-title {
    text-align: center; font-weight: 700; background: #f3f4f6;
    text-transform: uppercase; font-size: 10px;
  }
  .obs { min-height: 34px; }
  .foot {
    display: flex; justify-content: space-between;
    margin-top: 6px; font-size: 10px; color: #374151;
  }
  .spacer { height: 6px; border: 0; }
</style>
</head>
<body>
  <div class="frame">
    <table>
      <tr>
        <td class="logo" rowspan="1">
          ${d.logoUrl ? `<img src="${esc(d.logoUrl)}" alt="Logo" />` : ''}
        </td>
        <td class="company">
          <div class="name">AGROPECUARIA SANTA CRUZ LTDA</div>
          <div>NIT. 830.505.537-2</div>
          <div>KM 3 VÍA ORIENTAL TEL. 3766701</div>
          <div>MALAMBO - ATLÁNTICO</div>
        </td>
        <td class="logo"></td>
      </tr>
    </table>
    <table>
      <tr>
        <td class="title" colspan="3">
          RECIBO DE ANIMALES EN VEHÍCULO GUÍA No. ${esc(d.guia) || '—'}
        </td>
      </tr>
      <tr>
        <td class="lbl" style="width:33%">Fecha de ingreso</td>
        <td class="lbl" style="width:34%">Proveedor</td>
        <td class="lbl" style="width:33%">Procedencia</td>
      </tr>
      <tr>
        <td class="val">${esc(d.fecha) || '—'}</td>
        <td class="val">${esc(d.proveedor) || '—'}</td>
        <td class="val">${esc(d.procedencia) || '—'}</td>
      </tr>
      <tr>
        <td class="lbl">Ciudad</td>
        <td class="lbl">Cliente</td>
        <td class="lbl">Referencia</td>
      </tr>
      <tr>
        <td class="val">${esc(d.ciudad)}</td>
        <td class="val">${esc(d.cliente) || '—'}</td>
        <td class="val">${esc(d.referencia) || '—'}</td>
      </tr>
    </table>
  </div>

  <hr class="spacer" />

  <div class="frame">
    <table>
      <tr>
        <th rowspan="2" style="width:34px" class="grp">No.</th>
        <th rowspan="2" class="grp">Vehículo</th>
        <th rowspan="2" class="grp">Conductor</th>
        <th colspan="3" class="grp">Pesaje de vehículo</th>
        <th colspan="2" class="grp">Animales</th>
      </tr>
      <tr>
        <th class="grp">Entrada (kg)</th>
        <th class="grp">Salida (kg)</th>
        <th class="grp">Neto (kg)</th>
        <th class="grp">Cant.</th>
        <th class="grp">Prom. (kg)</th>
      </tr>
      <tr>
        <td class="center">1</td>
        <td class="center">${esc(d.placa) || '—'}</td>
        <td class="center">${esc(d.conductor) || '—'}</td>
        <td class="num">${esc(d.entrada)}</td>
        <td class="num">${esc(d.salida)}</td>
        <td class="num">${esc(d.neto)}</td>
        <td class="num">${esc(d.cantidad)}</td>
        <td class="num">${esc(d.prom)}</td>
      </tr>
    </table>
  </div>

  <hr class="spacer" />

  <div class="frame">
    <table>
      <tr><td class="section-title">Observaciones</td></tr>
      <tr><td class="obs">${esc(d.observaciones)}</td></tr>
    </table>
  </div>

  <div class="foot">
    <span>Agropecuaria Santa Cruz — Sistema de Planta</span>
    <span>Operario: ${esc(d.operario) || '—'} | ${esc(d.impreso)}</span>
  </div>
</body>
</html>`;
}

/** Abre el diálogo de impresión (Guardar como PDF) con el recibo. */
export function printRecibo(data: ReciboData) {
  const html = buildReciboHtml(data);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 500);
  };

  const doPrint = () => {
    win.focus();
    win.print();
    cleanup();
  };

  const imgs = Array.from(doc.images);
  if (imgs.length === 0) {
    doPrint();
    return;
  }
  let pending = imgs.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) doPrint();
  };
  imgs.forEach((img) => {
    if (img.complete) done();
    else {
      img.onload = done;
      img.onerror = done;
    }
  });
}
