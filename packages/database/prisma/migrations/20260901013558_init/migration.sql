-- CreateEnum
CREATE TYPE "Species" AS ENUM ('bovino');

-- CreateEnum
CREATE TYPE "UnitForm" AS ENUM ('canal_completa', 'media_canal', 'cuarto');

-- CreateEnum
CREATE TYPE "QuarterType" AS ENUM ('delantero', 'trasero');

-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('borrador', 'confirmado', 'en_desposte', 'cerrado', 'anulado');

-- CreateEnum
CREATE TYPE "GoodsReceiptItemStatus" AS ENUM ('disponible', 'en_desposte', 'despiezado', 'anulado');

-- CreateEnum
CREATE TYPE "CuttingOrderStatus" AS ENUM ('abierta', 'en_proceso', 'cerrada', 'anulada');

-- CreateEnum
CREATE TYPE "CutStatus" AS ENUM ('en_proceso', 'empacado', 'en_stock', 'despachado', 'anulado');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('primario', 'secundario');

-- CreateEnum
CREATE TYPE "ContainerType" AS ENUM ('canastilla', 'caja', 'bolsa');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('abierto', 'cerrado', 'en_stock', 'despachado', 'anulado');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('preparacion', 'despachado', 'anulado');

-- CreateEnum
CREATE TYPE "TraceUnitType" AS ENUM ('receipt_item', 'cut', 'package', 'shipment');

-- CreateEnum
CREATE TYPE "TraceUnitStatus" AS ENUM ('activa', 'bloqueada', 'consumida', 'despachada');

-- CreateEnum
CREATE TYPE "TraceRelation" AS ENUM ('transform', 'aggregate');

-- CreateEnum
CREATE TYPE "TraceEventType" AS ENUM ('ingreso', 'desposte', 'empaque', 'despacho');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'supervisor_desposte', 'operario_desposte', 'despacho', 'calidad');

-- CreateTable
CREATE TABLE "plant" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "invima_registry" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "document_id" TEXT,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ica_farm_code" TEXT,
    "document_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "origin_ica_code" TEXT,
    "received_date" DATE NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'borrador',
    "received_by" UUID NOT NULL,
    "extra" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "goods_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_item" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "goods_receipt_id" UUID NOT NULL,
    "item_code" TEXT NOT NULL,
    "unit_form" "UnitForm" NOT NULL,
    "quarter_type" "QuarterType",
    "weight_kg" DECIMAL(10,3) NOT NULL,
    "species" "Species" NOT NULL DEFAULT 'bovino',
    "status" "GoodsReceiptItemStatus" NOT NULL DEFAULT 'disponible',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goods_receipt_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_type" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "gtin" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutting_order" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "cutting_date" DATE NOT NULL,
    "status" "CuttingOrderStatus" NOT NULL DEFAULT 'abierta',
    "supervisor_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "cutting_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutting_record" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "cutting_order_id" UUID NOT NULL,
    "goods_receipt_item_id" UUID NOT NULL,
    "input_weight_kg" DECIMAL(10,3) NOT NULL,
    "output_weight_kg" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "shrink_kg" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "yield_pct" DECIMAL(5,2),
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cutting_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cut" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "cutting_record_id" UUID NOT NULL,
    "product_type_id" UUID NOT NULL,
    "cut_code" TEXT NOT NULL,
    "weight_kg" DECIMAL(10,3) NOT NULL,
    "status" "CutStatus" NOT NULL DEFAULT 'en_proceso',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "label_code" TEXT NOT NULL,
    "lot_number" TEXT NOT NULL,
    "container_type" "ContainerType" NOT NULL,
    "production_date" DATE NOT NULL,
    "expiry_date" DATE,
    "net_weight_kg" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "status" "PackageStatus" NOT NULL DEFAULT 'abierto',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_item" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "cut_id" UUID NOT NULL,
    "weight_kg" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "package_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document_id" TEXT,
    "address" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "remission_number" TEXT NOT NULL,
    "dispatched_at" TIMESTAMPTZ(6),
    "status" "ShipmentStatus" NOT NULL DEFAULT 'preparacion',
    "dispatched_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_item" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "weight_kg" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "shipment_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_unit" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "unit_type" "TraceUnitType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "public_code" TEXT NOT NULL,
    "status" "TraceUnitStatus" NOT NULL DEFAULT 'activa',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trace_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_link" (
    "id" UUID NOT NULL,
    "parent_unit_id" UUID NOT NULL,
    "child_unit_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "relation" "TraceRelation" NOT NULL,
    "quantity_kg" DECIMAL(10,3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trace_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_event" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "event_type" "TraceEventType" NOT NULL,
    "actor_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "trace_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plant_code_key" ON "plant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE INDEX "app_user_plant_id_idx" ON "app_user"("plant_id");

-- CreateIndex
CREATE INDEX "supplier_plant_id_idx" ON "supplier"("plant_id");

-- CreateIndex
CREATE INDEX "goods_receipt_plant_id_status_idx" ON "goods_receipt"("plant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_plant_id_receipt_number_key" ON "goods_receipt"("plant_id", "receipt_number");

-- CreateIndex
CREATE INDEX "goods_receipt_item_plant_id_status_idx" ON "goods_receipt_item"("plant_id", "status");

-- CreateIndex
CREATE INDEX "goods_receipt_item_goods_receipt_id_idx" ON "goods_receipt_item"("goods_receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_type_name_key" ON "product_type"("name");

-- CreateIndex
CREATE INDEX "cutting_order_plant_id_status_idx" ON "cutting_order"("plant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cutting_order_plant_id_order_number_key" ON "cutting_order"("plant_id", "order_number");

-- CreateIndex
CREATE INDEX "cutting_record_cutting_order_id_idx" ON "cutting_record"("cutting_order_id");

-- CreateIndex
CREATE INDEX "cutting_record_goods_receipt_item_id_idx" ON "cutting_record"("goods_receipt_item_id");

-- CreateIndex
CREATE INDEX "cut_cutting_record_id_idx" ON "cut"("cutting_record_id");

-- CreateIndex
CREATE INDEX "cut_plant_id_status_idx" ON "cut"("plant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cut_plant_id_cut_code_key" ON "cut"("plant_id", "cut_code");

-- CreateIndex
CREATE INDEX "package_plant_id_status_idx" ON "package"("plant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "package_plant_id_label_code_key" ON "package"("plant_id", "label_code");

-- CreateIndex
CREATE INDEX "package_item_cut_id_idx" ON "package_item"("cut_id");

-- CreateIndex
CREATE UNIQUE INDEX "package_item_package_id_cut_id_key" ON "package_item"("package_id", "cut_id");

-- CreateIndex
CREATE INDEX "customer_plant_id_idx" ON "customer"("plant_id");

-- CreateIndex
CREATE INDEX "shipment_plant_id_status_idx" ON "shipment"("plant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_plant_id_remission_number_key" ON "shipment"("plant_id", "remission_number");

-- CreateIndex
CREATE INDEX "shipment_item_package_id_idx" ON "shipment_item"("package_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_item_shipment_id_package_id_key" ON "shipment_item"("shipment_id", "package_id");

-- CreateIndex
CREATE INDEX "trace_unit_plant_id_unit_type_idx" ON "trace_unit"("plant_id", "unit_type");

-- CreateIndex
CREATE UNIQUE INDEX "trace_unit_unit_type_entity_id_key" ON "trace_unit"("unit_type", "entity_id");

-- CreateIndex
CREATE INDEX "trace_link_parent_unit_id_idx" ON "trace_link"("parent_unit_id");

-- CreateIndex
CREATE INDEX "trace_link_child_unit_id_idx" ON "trace_link"("child_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "trace_link_parent_unit_id_child_unit_id_event_id_key" ON "trace_link"("parent_unit_id", "child_unit_id", "event_id");

-- CreateIndex
CREATE INDEX "trace_event_plant_id_event_type_idx" ON "trace_event"("plant_id", "event_type");

-- CreateIndex
CREATE INDEX "trace_event_occurred_at_idx" ON "trace_event"("occurred_at");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_item" ADD CONSTRAINT "goods_receipt_item_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_order" ADD CONSTRAINT "cutting_order_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_order" ADD CONSTRAINT "cutting_order_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_record" ADD CONSTRAINT "cutting_record_cutting_order_id_fkey" FOREIGN KEY ("cutting_order_id") REFERENCES "cutting_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_record" ADD CONSTRAINT "cutting_record_goods_receipt_item_id_fkey" FOREIGN KEY ("goods_receipt_item_id") REFERENCES "goods_receipt_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cut" ADD CONSTRAINT "cut_cutting_record_id_fkey" FOREIGN KEY ("cutting_record_id") REFERENCES "cutting_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cut" ADD CONSTRAINT "cut_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package" ADD CONSTRAINT "package_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_item" ADD CONSTRAINT "package_item_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_item" ADD CONSTRAINT "package_item_cut_id_fkey" FOREIGN KEY ("cut_id") REFERENCES "cut"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_dispatched_by_fkey" FOREIGN KEY ("dispatched_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_item" ADD CONSTRAINT "shipment_item_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_item" ADD CONSTRAINT "shipment_item_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_unit" ADD CONSTRAINT "trace_unit_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_link" ADD CONSTRAINT "trace_link_parent_unit_id_fkey" FOREIGN KEY ("parent_unit_id") REFERENCES "trace_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_link" ADD CONSTRAINT "trace_link_child_unit_id_fkey" FOREIGN KEY ("child_unit_id") REFERENCES "trace_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_link" ADD CONSTRAINT "trace_link_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "trace_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_event" ADD CONSTRAINT "trace_event_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_event" ADD CONSTRAINT "trace_event_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
