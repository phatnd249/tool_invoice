-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "cronExpression" TEXT NOT NULL DEFAULT '',
    "repeatMode" TEXT NOT NULL DEFAULT 'weekly',
    "scheduledAt" DATETIME,
    "dateRangeDays" INTEGER,
    "invoiceType" TEXT NOT NULL DEFAULT 'SELL',
    "overwriteMode" TEXT NOT NULL DEFAULT 'SKIP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRun" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "schedule_companies" (
    "scheduleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("scheduleId", "companyId"),
    CONSTRAINT "schedule_companies_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "schedule_companies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
