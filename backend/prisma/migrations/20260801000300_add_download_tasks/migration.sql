-- CreateTable
CREATE TABLE "download_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "createdBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalInvoices" INTEGER NOT NULL DEFAULT 0,
    "processedInvoices" INTEGER NOT NULL DEFAULT 0,
    "invoiceType" TEXT NOT NULL DEFAULT 'BOTH',
    "dateStart" TEXT NOT NULL,
    "dateEnd" TEXT NOT NULL,
    "logs" TEXT NOT NULL DEFAULT '[]',
    "result" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "download_tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "download_tasks_companyId_status_idx" ON "download_tasks"("companyId", "status");
