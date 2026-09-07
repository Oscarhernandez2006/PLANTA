/*
  Warnings:

  - A unique constraint covering the columns `[document_id]` on the table `app_user` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "pin_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "app_user_document_id_key" ON "app_user"("document_id");
