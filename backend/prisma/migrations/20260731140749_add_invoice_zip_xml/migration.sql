-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "downloadStatus" TEXT;
ALTER TABLE "invoices" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "invoices" ADD COLUMN "xmlPath" TEXT;
ALTER TABLE "invoices" ADD COLUMN "zipPath" TEXT;
