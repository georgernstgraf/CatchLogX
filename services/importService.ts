/**
 * The one write path for imported catch data (#202).
 *
 * A bulk upload validates every file first (services/uploadService.ts) and
 * then lands here: one transaction for the whole bulk, one `Imports` row per
 * file, every sampling carrying its `importId`. There is no second parser —
 * the rows are re-read with `readDataRows`, the same function the validator
 * uses.
 */

import { createHash, randomUUID } from "node:crypto";
import type { Prisma, UserRoles } from "@/app/generated/prisma";
import { prisma } from "@/lib/prisma";
import { buildFileBlobData, blobToBuffer, XLSX_MIME_TYPE } from "@/lib/fileBlobs";
import {
  buildSpeciesIndex,
  resolveSpecies,
  type SpeciesMasterEntry,
} from "@/lib/fishSpecies";
import { readDataRows, type DataObject } from "@/lib/excelRows";

type Tx = Prisma.TransactionClient;

/**
 * Transaction limits for the two long-running transactions (#209). Prisma's
 * default is 5 s, which the cutover dry run proved too small: `2026_B`
 * (13 454 rows) died on `Transaction already closed`, and the largest
 * delivery (35 413 rows) is several times that. 120 s is generous headroom
 * and still far below nginx's `proxy_read_timeout 600s`.
 */
const TX_OPTIONS = { timeout: 120_000, maxWait: 10_000 } as const;

/** One file as it arrives from the API. */
export type ImportFile = {
  fileName: string;
  buffer: Buffer;
};

/** What the caller gets back per imported file. */
export type ImportRecord = {
  id: string;
  fileName: string;
  rowCount: number;
  createdAt: Date;
};

export type ImportOutcome = {
  imports: ImportRecord[];
  samplings: number;
  catches: number;
};

/** Thrown when the same bytes are already imported and still active. */
export class DuplicateImportError extends Error {
  constructor(
    readonly fileName: string,
    readonly existing: { id: string; fileName: string; createdAt: Date },
  ) {
    super(
      `"${fileName}" was already imported on ${existing.createdAt.toISOString().slice(0, 10)} (import ${existing.id}, file "${existing.fileName}").`,
    );
    this.name = "DuplicateImportError";
  }
}

/** sha256 of the received bytes — the duplicate guard (#184). */
export function fileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

// --- value parsing (moved here from adminService, #202) ---------------------

/** Exported for unit tests (#112). */
export function parseDate(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Excel serial date (days since 1899-12-30).
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  const asString = String(value).trim();
  if (!asString) return null;
  // German dd.mm.yyyy
  const german = asString.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (german) {
    const [, day, month, year] = german;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(asString);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Exported for unit tests (#112). */
export function toFloat(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = parseFloat(String(value).replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
}

/** Exported for unit tests (#112). */
export function toInt(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Exported for unit tests (#112). */
export function toBoolean(value: any): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().toLowerCase();
  if (text === "yes" || text === "true" || text === "ja") return true;
  if (text === "no" || text === "false" || text === "nein") return false;
  return null;
}

// --- row → entity mapping (pure, #202) --------------------------------------

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const asString = String(value).trim();
  return asString === "" ? null : asString;
};

/**
 * The synthetic site code of a data row: `river__site__lat__long`.
 *
 * Deterministic so a re-import of the same site updates the existing
 * `RiverSite` instead of creating a duplicate (the new template carries no
 * `site_code` column).
 */
export function buildSiteCode(row: DataObject): string {
  return [
    String(row["river_name"] ?? "").trim(),
    String(row["site_name"] ?? "").trim(),
    String(row["lat_up"] ?? "").trim(),
    String(row["long_up"] ?? "").trim(),
  ].join("__");
}

/** The `RiverSite` fields of a data row. */
export function buildRiverSiteData(row: DataObject) {
  return {
    riverName: String(row["river_name"] ?? ""),
    siteName: text(row["site_name"]),
    landmarkUp: text(row["landmark_up"]),
    latitude: toFloat(row["lat_up"]),
    longitude: toFloat(row["long_up"]),
    landmarkDown: text(row["landmark_down"]),
    latDown: toFloat(row["lat_down"]),
    longDown: toFloat(row["long_down"]),
    localityLength: toFloat(row["length_site"]),
    localityWidth: toFloat(row["width_site"]),
  };
}

/** The `Sampling` fields of a data row (one sampling per site and date). */
export function buildSamplingData(
  row: DataObject,
  siteId: number,
  importId: string,
) {
  return {
    siteId,
    importId,
    year: toInt(row["year"]) ?? new Date().getFullYear(),
    catchDate: parseDate(row["date"]),
    dataProvider: text(row["data_provider"]),
    askProviderBeforeUse: toBoolean(row["approval_required"]),
    source: text(row["source"]),
    project: text(row["project"]),
    fishingAuthority: text(row["fishing_district"]),
    preclassificationStressor: text(row["preclassification_stressor"]),
    temp: toFloat(row["temp"]),
    conductivity: toFloat(row["conductivity"]),
    pHValue: toFloat(row["pH_value"]),
    oCont: toFloat(row["ox_cont"]),
    oSat: toFloat(row["ox_sat"]),
    method: text(row["method"]),
    assessment: text(row["assessment"]),
    samplingStrategy: text(row["sampling_time"]),
    anodes: toInt(row["anodes"]),
    numSubsections: null,
    lengthSubsection: toFloat(row["fished_length"]),
    widthSubsection: toFloat(row["fished_width"]),
    typeOfStrip: text(row["type_of_strip"]),
    habitat: text(row["habitat"]),
    runStrip: null,
    catchEfficiency: toFloat(row["catch_efficiency"]),
    remarksRawData: text(row["remark_raw_data"]),
    remarkImport: text(row["remark_import"]),
  };
}

/** The `FishCatch` fields of a data row. */
export function buildCatchData(
  row: DataObject,
  samplingId: number,
  speciesId: number,
  recapture: boolean,
) {
  return {
    samplingId,
    speciesId,
    fishId: text(row["fish_id"]),
    lengthMm: toInt(row["total_length"]),
    totalWeightGr: toFloat(row["weight"]),
    pitDec: text(row["pit_dec"]),
    pitHex: text(row["pit_hex"]),
    recapture,
  };
}

/** The catch date of a row as a stable key (`YYYY-MM-DD`). */
function samplingKey(siteCode: string, row: DataObject): string {
  const date = parseDate(row["date"]);
  return `${siteCode}|${date ? date.toISOString().slice(0, 10) : "null"}`;
}

// --- the write path ---------------------------------------------------------

const PIT_LOOKUP_BATCH = 500;
const CATCH_INSERT_BATCH = 1000;

/** Distinct PIT tags of a batch of rows, in file order. */
function pitTags(rows: DataObject[]): string[] {
  const tags = new Set<string>();
  for (const row of rows) {
    const tag = text(row["pit_dec"]);
    if (tag) tags.add(tag);
  }
  return [...tags];
}

/** Adds the tags of this file that already exist in the database to `seen`. */
async function loadStoredPits(
  tx: Tx,
  rows: DataObject[],
  seen: Set<string>,
): Promise<void> {
  const unknown = pitTags(rows).filter((tag) => !seen.has(tag));

  for (let i = 0; i < unknown.length; i += PIT_LOOKUP_BATCH) {
    const batch = unknown.slice(i, i + PIT_LOOKUP_BATCH);
    const found = await tx.fishCatch.findMany({
      where: { pitDec: { in: batch } },
      select: { pitDec: true },
      distinct: ["pitDec"],
    });
    for (const row of found) {
      if (row.pitDec) seen.add(row.pitDec);
    }
  }
}

/**
 * Writes a validated bulk: one transaction, one `Imports` row per file, then
 * sites, samplings and catches. All-or-nothing — a failure rolls the whole
 * bulk back, including the stored original files.
 */
export async function writeImports(
  files: ImportFile[],
  userId: string,
  batchId: string = randomUUID(),
  speciesIndex?: Map<string, SpeciesMasterEntry>,
): Promise<ImportOutcome> {
  const species =
    speciesIndex ??
    buildSpeciesIndex(
      await prisma.fishSpecies.findMany({
        select: { id: true, speciesName: true },
      }),
    );

  return prisma.$transaction(async (tx) => {
    const imports: ImportRecord[] = [];
    let samplings = 0;
    let catches = 0;
    // PIT tags seen so far: from the database and from earlier files of this
    // bulk. File order matters — file B sees file A (#184).
    const seenPits = new Set<string>();

    for (const file of files) {
      const hash = fileHash(file.buffer);
      const fileName = file.fileName;

      // Serialize concurrent uploads of the same bytes, then re-check inside
      // the transaction: the validation-phase check is read-only.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${hash}))`;
      const existing = await tx.imports.findFirst({
        where: { fileHash: hash },
        select: { id: true, fileName: true, createdAt: true },
      });
      if (existing) {
        throw new DuplicateImportError(fileName, existing);
      }

      const { rows } = readDataRows(file.buffer);

      const record = await tx.imports.create({
        data: {
          batchId,
          user: { connect: { id: userId } },
          fileName,
          fileHash: hash,
          rowCount: rows.length,
          blob: {
            create: buildFileBlobData({
              fileName,
              mimeType: XLSX_MIME_TYPE,
              data: file.buffer,
            }),
          },
        },
        select: { id: true, fileName: true, rowCount: true, createdAt: true },
      });
      imports.push(record);

      await loadStoredPits(tx, rows, seenPits);

      // One RiverSite upsert per distinct site, one Sampling per site+date.
      const bySite = new Map<string, DataObject[]>();
      for (const row of rows) {
        const code = buildSiteCode(row);
        const list = bySite.get(code) ?? [];
        list.push(row);
        bySite.set(code, list);
      }

      for (const [siteCode, siteRows] of bySite) {
        const siteData = buildRiverSiteData(siteRows[0]);
        const site = await tx.riverSite.upsert({
          where: { siteCode },
          create: { siteCode, ...siteData },
          update: siteData,
          select: { id: true },
        });

        const bySampling = new Map<string, DataObject[]>();
        for (const row of siteRows) {
          const key = samplingKey(siteCode, row);
          const list = bySampling.get(key) ?? [];
          list.push(row);
          bySampling.set(key, list);
        }

        for (const samplingRows of bySampling.values()) {
          const sampling = await tx.sampling.create({
            data: buildSamplingData(samplingRows[0], site.id, record.id),
            select: { id: true },
          });
          samplings += 1;

          const data = samplingRows.map((row) => {
            const tag = text(row["pit_dec"]);
            const recapture = Boolean(tag && seenPits.has(tag));
            if (tag) seenPits.add(tag);

            const speciesName = String(row["species"] ?? "").trim();
            const match = resolveSpecies(species, speciesName);
            if (!match) {
              // The validation rejects unknown species before we get here; a
              // miss now is a bug, not a data problem.
              throw new Error(
                `Species "${speciesName}" is not in fish_species (file "${fileName}").`,
              );
            }

            return buildCatchData(row, sampling.id, match.id, recapture);
          });

          for (let i = 0; i < data.length; i += CATCH_INSERT_BATCH) {
            const result = await tx.fishCatch.createMany({
              data: data.slice(i, i + CATCH_INSERT_BATCH),
            });
            catches += result.count;
          }
        }
      }
    }

    return { imports, samplings, catches };
  }, TX_OPTIONS);
}

// --- deletion ---------------------------------------------------------------

/** Who asks for the deletion: the owner or an admin. */
export type ImportActor = { id: string; role: UserRoles };

export type DeleteImportResult =
  | {
      deleted: true;
      catches: number;
      samplings: number;
      notFound?: never;
      forbidden?: never;
    }
  | { notFound: true; deleted?: never; forbidden?: never }
  | { forbidden: true; deleted?: never; notFound?: never };

const adminRoles = new Set<UserRoles>(["ADMIN", "SUPER_ADMIN"]);

/**
 * Deletes an import: its catches, its samplings, the original file **and the
 * `Imports` row itself**. Nothing is left behind — no tombstone (#184,
 * decided 2026-11-15); the only trace is the log line below, which lands in
 * the systemd journal. The fingerprint the row used to keep lives in the data
 * repo (`CatchLogX-Data`) and in the cutover runbook.
 *
 * `river_sites` and `fish_species` are shared and stay; `recapture` flags of
 * other imports are observations at import time and stay too (#184).
 */
export async function deleteImport(
  id: string,
  actor: ImportActor,
): Promise<DeleteImportResult> {
  const record = await prisma.imports.findUnique({
    where: { id },
    select: { id: true, fileName: true, userId: true, blobId: true },
  });

  if (!record) return { notFound: true };
  if (record.userId !== actor.id && !adminRoles.has(actor.role)) {
    return { forbidden: true };
  }

  return prisma.$transaction(async (tx) => {
    const samplingIds = await tx.sampling.findMany({
      where: { importId: id },
      select: { id: true },
    });

    const removedCatches = await tx.fishCatch.deleteMany({
      where: { samplingId: { in: samplingIds.map((sampling) => sampling.id) } },
    });
    const removedSamplings = await tx.sampling.deleteMany({
      where: { importId: id },
    });

    // The row goes before the blob: `Imports.blobId` is onDelete: Restrict, so
    // the blob cannot disappear while a row still points at it. A count of 0
    // means a concurrent delete won the race — answer "not found", the caller
    // asked for something that no longer exists.
    const removedImport = await tx.imports.deleteMany({ where: { id } });
    if (removedImport.count === 0) return { notFound: true as const };

    if (record.blobId) {
      await tx.fileBlob.delete({ where: { id: record.blobId } });
    }

    console.info(
      `[imports] deleted import ${id} ("${record.fileName}"): ` +
        `${removedCatches.count} catches, ${removedSamplings.count} samplings ` +
        `(owner ${record.userId}, deleted by ${actor.id})`,
    );

    return {
      deleted: true as const,
      catches: removedCatches.count,
      samplings: removedSamplings.count,
    };
  }, TX_OPTIONS);
}

// --- listing and download ---------------------------------------------------

export type ImportListItem = {
  id: string;
  fileName: string;
  fileHash: string;
  rowCount: number;
  createdAt: Date;
  samplings: number;
  userId: string;
  importedByUsername: string;
  importedByName: string | null;
};

/**
 * Lists imports newest first. Without `userId` it lists every import (admin
 * view), with it only the caller's own.
 */
export async function listImports(options?: {
  userId?: string;
}): Promise<ImportListItem[]> {
  const rows = await prisma.imports.findMany({
    where: options?.userId ? { userId: options.userId } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      fileHash: true,
      rowCount: true,
      createdAt: true,
      userId: true,
      user: { select: { username: true, name: true } },
      _count: { select: { samplings: true } },
    },
  });

  return rows.map(({ user, _count, ...row }) => ({
    ...row,
    samplings: _count.samplings,
    importedByUsername: user.username,
    importedByName: user.name,
  }));
}

/**
 * The stored original file of an import, or null when it was deleted.
 *
 * With an `actor`, only the owner or an admin gets the file — a download by a
 * stranger answers "not found", which leaks nothing.
 */
export async function getImportFile(
  importId: string,
  actor?: ImportActor,
) {
  const record = await prisma.imports.findUnique({
    where: { id: importId },
    select: {
      fileName: true,
      userId: true,
      blob: { select: { fileName: true, data: true } },
    },
  });

  if (!record?.blob) return null;
  if (
    actor &&
    record.userId !== actor.id &&
    !adminRoles.has(actor.role)
  ) {
    return null;
  }

  return {
    fileName: record.blob.fileName || record.fileName,
    fileBuffer: blobToBuffer(record.blob.data),
  };
}

/** MIME type of a stored import file. */
export function getContentType(): string {
  return XLSX_MIME_TYPE;
}
