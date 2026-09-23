-- CreateTable
CREATE TABLE "CIRun" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "workflowRunId" BIGINT NOT NULL,
    "workflowName" TEXT NOT NULL,
    "headSha" TEXT NOT NULL,
    "pullNumber" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "classification" TEXT,
    "summary" TEXT,
    "postedCommentId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CIRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CIRun_workflowRunId_key" ON "CIRun"("workflowRunId");

-- AddForeignKey
ALTER TABLE "CIRun" ADD CONSTRAINT "CIRun_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
