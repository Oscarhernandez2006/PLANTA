// Copia el build del frontend (apps/web/dist) dentro del paquete de escritorio
// antes de generar el instalador con electron-builder.
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '..', 'web', 'dist');
const dest = path.join(__dirname, 'web');

if (!fs.existsSync(src)) {
  console.error(
    'No se encontró apps/web/dist. Ejecutá primero: pnpm --filter @frigorifico/web build',
  );
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('Frontend copiado a apps/desktop/web');
