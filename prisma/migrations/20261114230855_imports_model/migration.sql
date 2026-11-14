/*
  Warnings:

  - You are about to drop the `Uploads` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `importId` to the `samplings` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Uploads" DROP CONSTRAINT "Uploads_blobId_fkey";

-- DropForeignKey
ALTER TABLE "Uploads" DROP CONSTRAINT "Uploads_uploaded_by_fkey";

-- AlterTable
ALTER TABLE "samplings" ADD COLUMN     "importId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Uploads";

-- DropEnum
DROP TYPE "UploadStates";

-- CreateTable
CREATE TABLE "Imports" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "blobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,

    CONSTRAINT "Imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Imports_userId_createdAt_idx" ON "Imports"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Imports_fileHash_idx" ON "Imports"("fileHash");

-- CreateIndex
CREATE INDEX "fish_catches_pitDec_idx" ON "fish_catches"("pitDec");

-- CreateIndex
CREATE INDEX "samplings_importId_idx" ON "samplings"("importId");

-- AddForeignKey
ALTER TABLE "Imports" ADD CONSTRAINT "Imports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Imports" ADD CONSTRAINT "Imports_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Imports" ADD CONSTRAINT "Imports_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "FileBlob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samplings" ADD CONSTRAINT "samplings_importId_fkey" FOREIGN KEY ("importId") REFERENCES "Imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
