// Capacidad de canales por cava (mínimo/máximo). Solo se hace cumplir el
// máximo: si ya está llena, no se permite ingresar otra canal.
export const CAVA_CAPACIDAD: Record<string, { min: number; max: number }> = {
  'CAVA 1': { min: 105, max: 120 },
  'CAVA 2': { min: 90, max: 105 },
  'CAVA 3': { min: 90, max: 105 },
  'CAVA 4': { min: 90, max: 105 },
  'CAVA 5': { min: 75, max: 90 },
  'SALA DE OREO': { min: 160, max: 180 },
};
