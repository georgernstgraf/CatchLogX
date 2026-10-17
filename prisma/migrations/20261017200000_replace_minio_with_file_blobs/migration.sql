/*
  Warnings:

  - You are about to drop the column `filePath` on the `TemplateFiles` table. All the data in the column will be lost.
  - You are about to drop the column `link` on the `Uploads` table. All the data in the column will be lost.
  - Added the required column `blobId` to the `TemplateFiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `blobId` to the `Uploads` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TemplateFiles" DROP COLUMN "filePath",
ADD COLUMN     "blobId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Uploads" DROP COLUMN "link",
ADD COLUMN     "blobId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "FileBlob" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileBlob_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TemplateFiles" ADD CONSTRAINT "TemplateFiles_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "FileBlob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Uploads" ADD CONSTRAINT "Uploads_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "FileBlob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
