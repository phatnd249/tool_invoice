-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taxCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lookupPassword" TEXT NOT NULL,
    "token" TEXT,
    "tokenExpiredAt" DATETIME,
    "loginMode" TEXT NOT NULL DEFAULT 'AUTO',
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "address" TEXT,
    "taxAddress" TEXT,
    "representative" TEXT,
    "phone" TEXT,
    "activeDate" TEXT,
    "managedBy" TEXT,
    "companyType" TEXT,
    "status" TEXT,
    "lastSyncedAt" DATETIME,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "companies_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_taxCode_key" ON "companies"("taxCode");
