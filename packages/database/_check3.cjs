const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.ordenBeneficio.findMany({
  where: { deletedAt: null },
  select: {
    id: true,
    reference: true,
    cliente: true,
    canalTipo: true,
    eventos: { select: { id: true, sequence: true, canalPiezas: true } },
  },
})
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    return p.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    return p.$disconnect();
  });
