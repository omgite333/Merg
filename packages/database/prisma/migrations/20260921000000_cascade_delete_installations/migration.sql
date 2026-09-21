-- AlterTable
ALTER TABLE "ReviewSession" DROP CONSTRAINT "ReviewSession_installationId_fkey";
ALTER TABLE "ReviewSession" ADD CONSTRAINT "ReviewSession_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ReviewComment" DROP CONSTRAINT "ReviewComment_sessionId_fkey";
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;