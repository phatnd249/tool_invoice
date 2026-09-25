-- CreateTable
CREATE TABLE "backup_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "fileSize" REAL,
    "driveFileId" TEXT,
    "driveFileUrl" TEXT,
    "status" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "backup_logs_status_createdAt_idx" ON "backup_logs"("status", "createdAt");
