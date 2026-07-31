-- RedefineTables
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
    "zipPath" TEXT,
    "xmlPath" TEXT,
    "downloadStatus" TEXT,
    "errorMessage" TEXT,
    "companyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_invoices" ("id", "invoiceNumber", "invoiceDate", "templateSymbol", "invoiceSymbol", "sellerTaxCode", "sellerName", "buyerTaxCode", "buyerName", "totalBeforeTax", "taxAmount", "totalAmount", "totalAmountInWords", "invoiceStatus", "processStatus", "type", "source", "zipPath", "xmlPath", "downloadStatus", "errorMessage", "companyId", "createdAt", "updatedAt") SELECT "id", "invoiceNumber", "invoiceDate", "templateSymbol", "invoiceSymbol", "sellerTaxCode", "sellerName", "buyerTaxCode", "buyerName", "totalBeforeTax", "taxAmount", "totalAmount", "totalAmountInWords", "invoiceStatus", "processStatus", "type", "source", "zipPath", "xmlPath", "downloadStatus", "errorMessage", "companyId", "createdAt", "updatedAt" FROM "invoices";
DROP TABLE "invoices";
ALTER TABLE "new_invoices" RENAME TO "invoices";
CREATE UNIQUE INDEX "invoices_invoiceNumber_invoiceSymbol_templateSymbol_sellerTaxCode_buyerTaxCode_key" ON "invoices"("invoiceNumber", "invoiceSymbol", "templateSymbol", "sellerTaxCode", "buyerTaxCode");
CREATE INDEX "invoices_companyId_type_invoiceDate_idx" ON "invoices"("companyId", "type", "invoiceDate");
CREATE INDEX "invoices_sellerTaxCode_invoiceDate_idx" ON "invoices"("sellerTaxCode", "invoiceDate");
CREATE INDEX "invoices_buyerTaxCode_invoiceDate_idx" ON "invoices"("buyerTaxCode", "invoiceDate");
