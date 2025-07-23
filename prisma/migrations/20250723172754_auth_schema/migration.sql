-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "hashedPassword" TEXT NOT NULL,
    "name" TEXT
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "river_sites" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "siteCode" TEXT NOT NULL,
    "riverName" TEXT NOT NULL,
    "siteName" TEXT,
    "landmarkUp" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "landmarkDown" TEXT,
    "latDown" REAL,
    "longDown" REAL,
    "localityLength" REAL,
    "localityWidth" REAL
);

-- CreateTable
CREATE TABLE "samplings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "siteId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "catchDate" DATETIME,
    "dataProvider" TEXT,
    "askProviderBeforeUse" BOOLEAN,
    "source" TEXT,
    "project" TEXT,
    "fishingAuthority" TEXT,
    "preclassificationStressor" TEXT,
    "temp" REAL,
    "conductivity" REAL,
    "pHValue" REAL,
    "oCont" REAL,
    "oSat" REAL,
    "method" TEXT,
    "assessment" TEXT,
    "samplingStrategy" TEXT,
    "anodes" INTEGER,
    "numSubsections" INTEGER,
    "lengthSubsection" REAL,
    "widthSubsection" REAL,
    "typeOfStrip" TEXT,
    "habitat" TEXT,
    "runStrip" TEXT,
    "catchEfficiency" REAL,
    "remarksRawData" TEXT,
    "remarkImport" TEXT,
    CONSTRAINT "samplings_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "river_sites" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fish_catches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "samplingId" INTEGER NOT NULL,
    "fishId" TEXT,
    "speciesId" INTEGER NOT NULL,
    "lengthMm" INTEGER,
    "totalWeightGr" REAL,
    CONSTRAINT "fish_catches_samplingId_fkey" FOREIGN KEY ("samplingId") REFERENCES "samplings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fish_catches_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "fish_species" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fish_species" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "speciesName" TEXT NOT NULL,
    "germanName" TEXT,
    "latinName" TEXT,
    "family" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "river_sites_siteCode_key" ON "river_sites"("siteCode");

-- CreateIndex
CREATE UNIQUE INDEX "fish_species_speciesName_key" ON "fish_species"("speciesName");
