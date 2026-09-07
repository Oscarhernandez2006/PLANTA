/**
 * Enums de dominio compartidos entre API (NestJS) y Web (React).
 * Reflejan 1:1 los enums definidos en la base de datos (Prisma / PostgreSQL).
 */

export enum Species {
  BOVINO = 'bovino',
}

/** Forma física en la que ingresa la mercancía a desposte. */
export enum UnitForm {
  CANAL_COMPLETA = 'canal_completa',
  MEDIA_CANAL = 'media_canal',
  CUARTO = 'cuarto',
}

/** Solo aplica cuando UnitForm = CUARTO. */
export enum QuarterType {
  DELANTERO = 'delantero',
  TRASERO = 'trasero',
}

export enum GoodsReceiptStatus {
  BORRADOR = 'borrador',
  CONFIRMADO = 'confirmado',
  EN_DESPOSTE = 'en_desposte',
  CERRADO = 'cerrado',
  ANULADO = 'anulado',
}

export enum GoodsReceiptItemStatus {
  DISPONIBLE = 'disponible',
  EN_DESPOSTE = 'en_desposte',
  DESPIEZADO = 'despiezado',
  ANULADO = 'anulado',
}

export enum CuttingOrderStatus {
  ABIERTA = 'abierta',
  EN_PROCESO = 'en_proceso',
  CERRADA = 'cerrada',
  ANULADA = 'anulada',
}

export enum CutStatus {
  EN_PROCESO = 'en_proceso',
  EMPACADO = 'empacado',
  EN_STOCK = 'en_stock',
  DESPACHADO = 'despachado',
  ANULADO = 'anulado',
}

export enum ProductCategory {
  PRIMARIO = 'primario',
  SECUNDARIO = 'secundario',
}

/** Contenedor de empaque: mayormente canastilla, a veces caja o bolsa. */
export enum ContainerType {
  CANASTILLA = 'canastilla',
  CAJA = 'caja',
  BOLSA = 'bolsa',
}

export enum PackageStatus {
  ABIERTO = 'abierto',
  CERRADO = 'cerrado',
  EN_STOCK = 'en_stock',
  DESPACHADO = 'despachado',
  ANULADO = 'anulado',
}

export enum ShipmentStatus {
  PREPARACION = 'preparacion',
  DESPACHADO = 'despachado',
  ANULADO = 'anulado',
}

// ===== Trazabilidad (DAG) =====

export enum TraceUnitType {
  RECEIPT_ITEM = 'receipt_item',
  CUT = 'cut',
  PACKAGE = 'package',
  SHIPMENT = 'shipment',
}

export enum TraceUnitStatus {
  ACTIVA = 'activa',
  BLOQUEADA = 'bloqueada',
  CONSUMIDA = 'consumida',
  DESPACHADA = 'despachada',
}

export enum TraceRelation {
  TRANSFORM = 'transform',
  AGGREGATE = 'aggregate',
}

export enum TraceEventType {
  INGRESO = 'ingreso',
  DESPOSTE = 'desposte',
  EMPAQUE = 'empaque',
  DESPACHO = 'despacho',
}
