-- Hard delete for imports (#184, decided 2026-11-15): the tombstone is gone.
--
-- Existing tombstones carry no samplings and no file (`blobId` is null), so
-- deleting them loses nothing: the fingerprint they hold (name, sha256, row
-- count, who, when) lives in the data repo (`CatchLogX-Data`) and in the
-- cutover runbook. If a tombstone ever had samplings, this statement would
-- fail on the `Sampling.importId` foreign key — loudly, which is intended.
DELETE FROM "Imports" WHERE "deletedAt" IS NOT NULL;

/*
  Warnings:

  - You are about to drop the column `deletedAt` on the `Imports` table. All the data in the column will be lost.
  - You are about to drop the column `deletedByUserId` on the `Imports` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Imports" DROP CONSTRAINT "Imports_deletedByUserId_fkey";

-- AlterTable
ALTER TABLE "Imports" DROP COLUMN "deletedAt",
DROP COLUMN "deletedByUserId";
