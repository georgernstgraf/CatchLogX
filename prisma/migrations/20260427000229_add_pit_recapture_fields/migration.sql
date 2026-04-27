-- CreateEnum
CREATE TYPE "UploadStates" AS ENUM ('UPLOADED', 'ACCEPTED', 'REJECTED', 'DB_ERROR', 'SAVED_IN_DB');

-- CreateEnum
CREATE TYPE "PasswordResetStates" AS ENUM ('REQUESTED', 'EXPIRED', 'DONE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "hashedPassword" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "isFirstLogin" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQueries" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "UserQueries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DummyFiles" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DummyFiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResets" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "state" "PasswordResetStates" NOT NULL,
    "passwordChangedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordResets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Uploads" (
    "id" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "state" "UploadStates" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "river_sites" (
    "id" SERIAL NOT NULL,
    "siteCode" TEXT NOT NULL,
    "riverName" TEXT NOT NULL,
    "siteName" TEXT,
    "landmarkUp" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "landmarkDown" TEXT,
    "latDown" DOUBLE PRECISION,
    "longDown" DOUBLE PRECISION,
    "localityLength" DOUBLE PRECISION,
    "localityWidth" DOUBLE PRECISION,

    CONSTRAINT "river_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "samplings" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "catchDate" TIMESTAMP(3),
    "dataProvider" TEXT,
    "askProviderBeforeUse" BOOLEAN,
    "source" TEXT,
    "project" TEXT,
    "fishingAuthority" TEXT,
    "preclassificationStressor" TEXT,
    "temp" DOUBLE PRECISION,
    "conductivity" DOUBLE PRECISION,
    "pHValue" DOUBLE PRECISION,
    "oCont" DOUBLE PRECISION,
    "oSat" DOUBLE PRECISION,
    "method" TEXT,
    "assessment" TEXT,
    "samplingStrategy" TEXT,
    "anodes" INTEGER,
    "numSubsections" INTEGER,
    "lengthSubsection" DOUBLE PRECISION,
    "widthSubsection" DOUBLE PRECISION,
    "typeOfStrip" TEXT,
    "habitat" TEXT,
    "runStrip" TEXT,
    "catchEfficiency" DOUBLE PRECISION,
    "remarksRawData" TEXT,
    "remarkImport" TEXT,

    CONSTRAINT "samplings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fish_catches" (
    "id" SERIAL NOT NULL,
    "samplingId" INTEGER NOT NULL,
    "fishId" TEXT,
    "speciesId" INTEGER NOT NULL,
    "lengthMm" INTEGER,
    "totalWeightGr" DOUBLE PRECISION,
    "pitDec" TEXT,
    "pitHex" TEXT,
    "recapture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fish_catches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fish_species" (
    "id" SERIAL NOT NULL,
    "speciesName" TEXT NOT NULL,
    "germanName" TEXT,
    "latinName" TEXT,
    "family" TEXT,

    CONSTRAINT "fish_species_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResets_token_key" ON "PasswordResets"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "river_sites_siteCode_key" ON "river_sites"("siteCode");

-- CreateIndex
CREATE UNIQUE INDEX "fish_species_speciesName_key" ON "fish_species"("speciesName");

-- AddForeignKey
ALTER TABLE "UserQueries" ADD CONSTRAINT "UserQueries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Uploads" ADD CONSTRAINT "Uploads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samplings" ADD CONSTRAINT "samplings_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "river_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fish_catches" ADD CONSTRAINT "fish_catches_samplingId_fkey" FOREIGN KEY ("samplingId") REFERENCES "samplings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fish_catches" ADD CONSTRAINT "fish_catches_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "fish_species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
