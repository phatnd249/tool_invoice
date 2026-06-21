-- CreateTable
CREATE TABLE "Company" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taxCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lookupPassword" TEXT NOT NULL,
    "token" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "sellerName" TEXT NOT NULL,
    "sellerTaxCode" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerTaxCode" TEXT NOT NULL,
    "totalBeforeTax" REAL NOT NULL,
    "taxAmount" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "pdfPath" TEXT,
    "xmlPath" TEXT,
    "isSavedToDb" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DownloadHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "downloadDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taxCode" TEXT NOT NULL,
    "invoiceType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "log" TEXT,
    "countDownloaded" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "invoiceType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRun" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Schedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_taxCode_key" ON "Company"("taxCode");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_sellerTaxCode_buyerTaxCode_key" ON "Invoice"("invoiceNumber", "sellerTaxCode", "buyerTaxCode");
