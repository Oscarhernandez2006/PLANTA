-- CreateTable
CREATE TABLE "goods_receipt_audit" (
    "audit_id" BIGSERIAL NOT NULL,
    "operation" TEXT NOT NULL,
    "row_id" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" UUID,
    "old_data" JSONB,
    "new_data" JSONB,

    CONSTRAINT "goods_receipt_audit_pkey" PRIMARY KEY ("audit_id")
);

-- CreateTable
CREATE TABLE "goods_receipt_item_audit" (
    "audit_id" BIGSERIAL NOT NULL,
    "operation" TEXT NOT NULL,
    "row_id" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" UUID,
    "old_data" JSONB,
    "new_data" JSONB,

    CONSTRAINT "goods_receipt_item_audit_pkey" PRIMARY KEY ("audit_id")
);

-- CreateIndex
CREATE INDEX "goods_receipt_audit_row_id_idx" ON "goods_receipt_audit"("row_id");

-- CreateIndex
CREATE INDEX "goods_receipt_audit_changed_at_idx" ON "goods_receipt_audit"("changed_at");

-- CreateIndex
CREATE INDEX "goods_receipt_item_audit_row_id_idx" ON "goods_receipt_item_audit"("row_id");

-- CreateIndex
CREATE INDEX "goods_receipt_item_audit_changed_at_idx" ON "goods_receipt_item_audit"("changed_at");
