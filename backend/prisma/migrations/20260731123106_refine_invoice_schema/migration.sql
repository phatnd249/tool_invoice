/*
  Warnings:

  - You are about to drop the column `buyerAddress` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `discountAmount` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `exchangeRate` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `invoiceName` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `lookupCode` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `paymentMethod` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `sellerAddress` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `sellerPhone` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `taxAuthorityCode` on the `invoices` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_invoices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "templateSymbol" TEXT NOT NULL,
    "invoiceSymbol" TEXT NOT NULL,
    "sellerTaxCode" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "buyerTaxCode" TEXT,
    "buyerName" TEXT,
    "totalBeforeTax" REAL,
    "taxAmount" REAL,
    "totalAmount" REAL NOT NULL,
    "totalAmountInWords" TEXT,
    "invoiceStatus" INTEGER,
    "processStatus" INTEGER,
    "type" TEXT NOT NULL,
    "source" TEXT,
    "rawData" TEXT,
    "companyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_invoices" ("buyerName", "buyerTaxCode", "companyId", "createdAt", "id", "invoiceDate", "invoiceNumber", "invoiceStatus", "invoiceSymbol", "processStatus", "sellerName", "sellerTaxCode", "source", "taxAmount", "templateSymbol", "totalAmount", "totalAmountInWords", "totalBeforeTax", "type", "updatedAt") SELECT "buyerName", "buyerTaxCode", "companyId", "createdAt", "id", "invoiceDate", "invoiceNumber", "invoiceStatus", "invoiceSymbol", "processStatus", "sellerName", "sellerTaxCode", "source", "taxAmount", "templateSymbol", "totalAmount", "totalAmountInWords", "totalBeforeTax", "type", "updatedAt" FROM "invoices";
DROP TABLE "invoices";
ALTER TABLE "new_invoices" RENAME TO "invoices";
CREATE INDEX "invoices_companyId_type_invoiceDate_idx" ON "invoices"("companyId", "type", "invoiceDate");
CREATE INDEX "invoices_sellerTaxCode_invoiceDate_idx" ON "invoices"("sellerTaxCode", "invoiceDate");
CREATE INDEX "invoices_buyerTaxCode_invoiceDate_idx" ON "invoices"("buyerTaxCode", "invoiceDate");
CREATE UNIQUE INDEX "invoices_invoiceNumber_invoiceSymbol_templateSymbol_sellerTaxCode_buyerTaxCode_key" ON "invoices"("invoiceNumber", "invoiceSymbol", "templateSymbol", "sellerTaxCode", "buyerTaxCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
