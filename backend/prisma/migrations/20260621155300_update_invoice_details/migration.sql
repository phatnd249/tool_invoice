/*
  Warnings:

  - Added the required column `invoiceSymbol` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `templateSymbol` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" TEXT NOT NULL,
    "lineNumber" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" REAL,
    "price" REAL,
    "amount" REAL NOT NULL,
    "taxRate" TEXT,
    CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "templateSymbol" TEXT NOT NULL,
    "invoiceSymbol" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRate" REAL NOT NULL DEFAULT 1.0,
    "taxAuthorityCode" TEXT,
    "lookupCode" TEXT,
    "invoiceName" TEXT,
    "version" TEXT,
    "gdtProviderTaxCode" TEXT,
    "sellerName" TEXT NOT NULL,
    "sellerTaxCode" TEXT NOT NULL,
    "sellerAddress" TEXT,
    "sellerPhone" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerTaxCode" TEXT NOT NULL,
    "buyerAddress" TEXT,
    "buyerCustomerId" TEXT,
    "totalBeforeTax" REAL NOT NULL,
    "taxAmount" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "totalAmountInWords" TEXT,
    "type" TEXT NOT NULL,
    "pdfPath" TEXT,
    "xmlPath" TEXT,
    "zipPath" TEXT,
    "isSavedToDb" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Invoice" ("buyerName", "buyerTaxCode", "createdAt", "id", "invoiceDate", "invoiceNumber", "isSavedToDb", "pdfPath", "sellerName", "sellerTaxCode", "taxAmount", "totalAmount", "totalBeforeTax", "type", "updatedAt", "xmlPath") SELECT "buyerName", "buyerTaxCode", "createdAt", "id", "invoiceDate", "invoiceNumber", "isSavedToDb", "pdfPath", "sellerName", "sellerTaxCode", "taxAmount", "totalAmount", "totalBeforeTax", "type", "updatedAt", "xmlPath" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_invoiceNumber_sellerTaxCode_buyerTaxCode_key" ON "Invoice"("invoiceNumber", "sellerTaxCode", "buyerTaxCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
