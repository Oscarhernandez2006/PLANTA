import { CanalPiezaTipo, CanalTipo } from '@prisma/client';

/** Piezas esperadas por animal según el tipo de canal de la orden. */
export function piezasEsperadas(tipo: CanalTipo | null): CanalPiezaTipo[] {
  if (tipo === CanalTipo.canal_completa) return [CanalPiezaTipo.canal];
  if (
    tipo === CanalTipo.media_canal ||
    tipo === CanalTipo.media_canal_con_cola ||
    tipo === CanalTipo.media_canal_sin_cola
  ) {
    return [CanalPiezaTipo.cizq, CanalPiezaTipo.cder];
  }
  return [];
}
