-- AlterTable
ALTER TABLE "ReviewSession" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "baseSha" TEXT,
ADD COLUMN     "heartbeatAt" TIMESTAMP(3),
ADD COLUMN     "leaseId" TEXT,
ADD COLUMN     "workerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ReviewSession_leaseId_key" ON "ReviewSession"("leaseId");

-- CreateIndex
CREATE INDEX "ReviewSession_status_heartbeatAt_idx" ON "ReviewSession"("status", "heartbeatAt");

