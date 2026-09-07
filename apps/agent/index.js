#!/usr/bin/env node
// ============================================================================
// Agente local del Frigorífico
// Se instala en cada PC autorizado. Expone la(s) MAC(s) del equipo por
// localhost para que la web valide el acceso contra el registro de equipos.
//
// - Escucha SOLO en 127.0.0.1 (no accesible desde la red).
// - Sin dependencias externas (solo módulos nativos de Node).
// - Puerto configurable con la variable de entorno AGENT_PORT (default 47615).
//
// Uso:  node index.js      (o:  pnpm --filter @frigorifico/agent start)
// Empaquetado a .exe para Windows: ver notas al pie.
// ============================================================================

const http = require('node:http');
const os = require('node:os');

const PORT = Number(process.env.AGENT_PORT) || 47615;
const HOST = '127.0.0.1';

/** Devuelve las MAC físicas (no internas, no nulas), sin duplicados. */
function collectMacs() {
  const ifaces = os.networkInterfaces();
  const macs = new Set();
  const ordered = Object.keys(ifaces).sort();
  for (const name of ordered) {
    for (const info of ifaces[name] ?? []) {
      if (info.internal) continue;
      if (!info.mac || info.mac === '00:00:00:00:00:00') continue;
      macs.add(info.mac.toUpperCase());
    }
  }
  return [...macs];
}

function deviceInfo() {
  const macs = collectMacs();
  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    macs,
    primaryMac: macs[0] ?? null,
    agentVersion: '0.1.0',
  };
}

const server = http.createServer((req, res) => {
  // CORS: la web corre en otro origen (localhost:5173 / dominio de planta).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/device-info' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(deviceInfo()));
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, HOST, () => {
  const info = deviceInfo();
  console.log('=============================================');
  console.log(' Agente Frigorífico en ejecución');
  console.log(`  URL:      http://${HOST}:${PORT}/device-info`);
  console.log(`  Equipo:   ${info.hostname}`);
  console.log(`  MAC(s):   ${info.macs.join(', ') || '(ninguna detectada)'}`);
  console.log('=============================================');
});

// ----------------------------------------------------------------------------
// Empaquetado a ejecutable Windows (para instalar en cada PC y autoarrancar):
//   Opción A (pkg):   npx @yao-pkg/pkg index.js -t node20-win-x64 -o frigorifico-agent.exe
//   Opción B (SEA):   Node Single Executable Applications
// Luego programar el .exe en el arranque (Task Scheduler / carpeta Inicio).
// ----------------------------------------------------------------------------
