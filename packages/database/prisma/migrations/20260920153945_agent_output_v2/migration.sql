/*
  Warnings:

  - Added the required column `updatedAt` to the `ReviewSession` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ReviewComment" ADD COLUMN     "blocking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentCode" TEXT,
ADD COLUMN     "suggestion" TEXT;

-- AlterTable
ALTER TABLE "ReviewSession" ADD COLUMN "summary" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "ReviewSession" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

ALTER TABLE "ReviewSession" ALTER COLUMN "updatedAt" SET NOT NULL;