#!/usr/bin/env tsx
/**
 * One-time, data-preserving adoption of the legacy production database
 * (`prisma db push` era) to the migration-tracked baseline (#139).
 *
 * The only schema differences are:
 *   DummyFiles.filePath (a MinIO object key)  ->  TemplateFiles.blobId
 *   Uploads.link        (a MinIO object key)  ->  Uploads.blobId
 *   ... plus the new FileBlob table that holds the bytes.
 *
 * Usage:
 *   npx tsx scripts/adopt-legacy-prod.ts --source-dir <export> [--dry-run]
 *
 * `<export>` is a directory produced by `mc mirror` of the bucket, i.e. it
 * contains `CatchLogX/uploads/<name>` and `CatchLogX/dummy_files/<folder>/<name>`.
 *
 * The script is idempotent: running it again after a complete or partial run
 * only finishes what is left. `--dry-run` reports the plan and, importantly,
 * fails when a referenced file is missing so the rehearsal catches that before
 * the cutover.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../app/generated/prisma";
import {
  BLOB_TABLE,
  LEGACY_TEMPLATE_TABLE,
  LEGACY_UPLOAD_COLUMN,
  LEGACY_TEMPLATE_COLUMN,
  TEMPLATE_TABLE,
  buildSourceIndex,
  planAdoption,
  type AdoptionPlan,
  type LegacyRow,
} from "../lib/adoption";

interface Options {
  sourceDir: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  let sourceDir = "";
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--source-dir") {
      sourceDir = argv[i + 1] ?? "";
      i += 1;
    } else if (arg.startsWith("--source-dir=")) sourceDir = arg.slice("--source-dir=".length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!sourceDir) throw new Error("usage: adopt-legacy-prod.ts --source-dir <export> [--dry-run]");
  return { sourceDir, dryRun };
}

async function tableExists(prisma: PrismaClient, table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}`;
  return Number(rows[0].n) > 0;
}

async function columnInfo(prisma: PrismaClient, table: string, column: string): Promise<{ exists: boolean; notNull: boolean }> {
  const rows = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}`;
  if (rows.length === 0) return { exists: false, notNull: false };
  return { exists: true, notNull: rows[0].is_nullable === "NO" };
}

async function foreignKeyExists(prisma: PrismaClient, table: string, constraint: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = ${table} AND constraint_name = ${constraint}`;
  return Number(rows[0].n) > 0;
}

async function readLegacyRows(prisma: PrismaClient, table: string, column: string, hasBlobId: boolean): Promise<LegacyRow[]> {
  const filter = hasBlobId ? `WHERE "blobId" IS NULL` : "";
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
    `SELECT "id", "${column}" AS stored FROM "${table}" ${filter} ORDER BY "id"`,
  );
  return rows.map((row) => ({ id: row.id, storedPath: row.stored }));
}

async function inspect(prisma: PrismaClient) {
  const templateTableExists = await tableExists(prisma, LEGACY_TEMPLATE_TABLE);
  const blobTableExists = await tableExists(prisma, BLOB_TABLE);

  const tables = ["Uploads", "TemplateFiles"] as const;
  const blobIdColumnOn = {} as Record<(typeof tables)[number], boolean>;
  const legacyColumnsPresent = {} as Record<(typeof tables)[number], boolean>;
  const notNullOn = {} as Record<(typeof tables)[number], boolean>;
  const foreignKeysOn = {} as Record<(typeof tables)[number], boolean>;

  for (const table of tables) {
    const blobId = await columnInfo(prisma, table, "blobId");
    blobIdColumnOn[table] = blobId.exists;
    notNullOn[table] = blobId.notNull;
    // The legacy stored-path column lives on the legacy table name until the
    // rename has happened (DummyFiles before, TemplateFiles after).
    const legacyColumn = table === "Uploads" ? LEGACY_UPLOAD_COLUMN : LEGACY_TEMPLATE_COLUMN;
    const legacyTable = table === "Uploads" ? "Uploads" : templateTableExists ? LEGACY_TEMPLATE_TABLE : TEMPLATE_TABLE;
    legacyColumnsPresent[table] = (await columnInfo(prisma, legacyTable, legacyColumn)).exists;
    foreignKeysOn[table] = await foreignKeyExists(prisma, table, `${table}_blobId_fkey`);
  }

  const uploads = legacyColumnsPresent.Uploads
    ? await readLegacyRows(prisma, "Uploads", LEGACY_UPLOAD_COLUMN, blobIdColumnOn.Uploads)
    : [];
  const templateSourceTable = templateTableExists ? LEGACY_TEMPLATE_TABLE : TEMPLATE_TABLE;
  const templates = legacyColumnsPresent.TemplateFiles
    ? await readLegacyRows(prisma, templateSourceTable, LEGACY_TEMPLATE_COLUMN, blobIdColumnOn.TemplateFiles)
    : [];

  return {
    templateTableExists,
    blobTableExists,
    blobIdColumnOn,
    legacyColumnsPresent,
    notNullOn,
    foreignKeysOn,
    uploads,
    templates,
  };
}

function describePlan(plan: AdoptionPlan, dryRun: boolean): void {
  const lines: string[] = [];
  if (plan.renameTemplateTable) lines.push(`rename ${LEGACY_TEMPLATE_TABLE} -> ${TEMPLATE_TABLE}`);
  if (plan.createBlobTable) lines.push(`create table ${BLOB_TABLE}`);
  for (const table of plan.addBlobIdColumnTo) lines.push(`add nullable blobId to ${table}`);
  lines.push(`write ${plan.blobs.length} blob(s)`);
  for (const { table, column } of plan.dropColumns) lines.push(`drop ${table}.${column}`);
  for (const table of plan.setBlobIdNotNullOn) lines.push(`set ${table}.blobId NOT NULL`);
  for (const table of plan.addForeignKeyTo) lines.push(`add foreign key on ${table}.blobId`);
  console.log(`${dryRun ? "planned" : "performed"}:`);
  for (const line of lines) console.log(`  - ${line}`);
  for (const missing of plan.missingSources) {
    console.log(`  ! missing source for ${missing.table} ${missing.rowId}: ${missing.storedPath}`);
  }
}

const BLOB_DDL = `CREATE TABLE "FileBlob" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileBlob_pkey" PRIMARY KEY ("id")
)`;

async function apply(prisma: PrismaClient, plan: AdoptionPlan): Promise<void> {
  if (plan.renameTemplateTable) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${LEGACY_TEMPLATE_TABLE}" RENAME TO "${TEMPLATE_TABLE}"`);
  }
  if (plan.createBlobTable) {
    await prisma.$executeRawUnsafe(BLOB_DDL);
  }
  for (const table of plan.addBlobIdColumnTo) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "blobId" TEXT`);
  }

  // Bytes and their references are written in one transaction, so a failure
  // never leaves a blob without a referencing row (or the other way round).
  await prisma.$transaction(async (tx) => {
    for (const blob of plan.blobs) {
      const data = readFileSync(blob.source.absolutePath);
      const id = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO "FileBlob" ("id","fileName","mimeType","sizeBytes","data") VALUES ($1,$2,$3,$4,$5)`,
        id,
        blob.fileName,
        blob.mimeType,
        data.length,
        data,
      );
      await tx.$executeRawUnsafe(`UPDATE "${blob.table}" SET "blobId" = $1 WHERE "id" = $2`, id, blob.rowId);
    }
  });

  for (const { table, column } of plan.dropColumns) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" DROP COLUMN "${column}"`);
  }
  for (const table of plan.setBlobIdNotNullOn) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "blobId" SET NOT NULL`);
  }
  for (const table of plan.addForeignKeyTo) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "FileBlob"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const state = await inspect(prisma);
    const index = buildSourceIndex(options.sourceDir);
    const plan = planAdoption({ ...state, index });

    describePlan(plan, options.dryRun);

    if (plan.missingSources.length > 0) {
      throw new Error(
        `${plan.missingSources.length} referenced file(s) are missing from ${options.sourceDir} - refusing to change the schema`,
      );
    }
    if (options.dryRun) {
      console.log("dry run: nothing was written");
      return;
    }

    await apply(prisma, plan);

    const after = await inspect(prisma);
    const leftovers = after.uploads.length + after.templates.length;
    console.log(
      `done: ${plan.blobs.filter((b) => b.table === "Uploads").length} upload(s) and ${plan.blobs.filter((b) => b.table === "TemplateFiles").length} template(s) linked; ${leftovers} row(s) still unlinked`,
    );
    if (leftovers > 0) throw new Error(`${leftovers} row(s) still have no blob - not marking the adoption complete`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
