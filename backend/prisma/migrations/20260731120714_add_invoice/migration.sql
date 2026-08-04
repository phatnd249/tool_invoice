-- CreateTable
CREATE TABLE "invoices" (
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
    "sellerName" TEXT NOT NULL,
    "sellerTaxCode" TEXT NOT NULL,
    "sellerAddress" TEXT,
    "sellerPhone" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerTaxCode" TEXT NOT NULL,
    "buyerAddress" TEXT,
    "totalBeforeTax" REAL NOT NULL,
    "taxAmount" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "discountAmount" REAL,
    "totalAmountInWords" TEXT,
    "invoiceStatus" INTEGER,
    "processStatus" INTEGER,
    "type" TEXT NOT NULL,
    "source" TEXT,
    "companyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "lineNumber" INTEGER,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" REAL,
    "price" REAL,
    "amount" REAL NOT NULL,
    "taxRate" TEXT,
    CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "invoices_companyId_type_invoiceDate_idx" ON "invoices"("companyId", "type", "invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_invoiceSymbol_templateSymbol_sellerTaxCode_buyerTaxCode_key" ON "invoices"("invoiceNumber", "invoiceSymbol", "templateSymbol", "sellerTaxCode", "buyerTaxCode");
