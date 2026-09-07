-- CreateTable
CREATE TABLE "device" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "mac" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hostname" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_mac_key" ON "device"("mac");

-- CreateIndex
CREATE INDEX "device_plant_id_idx" ON "device"("plant_id");

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
