/*
  Warnings:

  - You are about to drop the column `companyId` on the `Schedule` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "ScheduleCompany" (
    "scheduleId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,

    PRIMARY KEY ("scheduleId", "companyId"),
    CONSTRAINT "ScheduleCompany_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Schedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT,
    "cronExpression" TEXT NOT NULL,
    "repeatMode" TEXT NOT NULL DEFAULT 'weekly',
    "scheduledAt" DATETIME,
    "dateRangeDays" INTEGER,
    "invoiceType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRun" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Schedule" ("createdAt", "cronExpression", "dateRangeDays", "id", "invoiceType", "isActive", "lastRun", "repeatMode", "updatedAt") SELECT "createdAt", "cronExpression", "dateRangeDays", "id", "invoiceType", "isActive", "lastRun", "repeatMode", "updatedAt" FROM "Schedule";
DROP TABLE "Schedule";
ALTER TABLE "new_Schedule" RENAME TO "Schedule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
