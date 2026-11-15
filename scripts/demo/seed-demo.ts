import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { assertSeedAllowed } from "@/lib/seedGuard";
import { createTemplateFile } from "@/services/templateFileService";

/**
 * Dev-only demo seed. Every step upserts by its natural key, and the template
 * files are only created when no live template file of that name exists.
 *
 * One-shot per database: the seed guard (#198) refuses as soon as the database
 * holds a single catch, because from that moment base data is operational data
 * ("Basisdaten-Cutover", docs/ai/DECISIONS.md). For a fresh demo dataset wipe
 * first (`scripts/demo/wipe-and-seed.ts`, needs ALLOW_DESTRUCTIVE_SEED).
 *
 * Usage: npm run db:init   (migrate + seed, the entry point for a new database)
 *        npm run seed:demo (seed only)
 */

const SEED_STEPS = [
  "scripts/ops/create-user.ts",
  "scripts/demo/insert-fish.ts",
  "scripts/demo/insert-river-sites.ts",
  "scripts/demo/insert-samplings.ts",
  "scripts/demo/insert-fish-catches.ts",
];

const TEMPLATE_FILES: { fileName: string; contentType: string }[] = [
  {
    fileName: "2026_Eingabemaske.Rohdaten.V.6.xlsx",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
];

function runStep(script: string) {
  console.log(`\n▶ ${script}`);
  execSync(`npx tsx ${script}`, { stdio: "inherit" });
}

async function seedTemplateFiles() {
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) {
    throw new Error("Dev user 'admin' missing — run scripts/ops/create-user.ts first.");
  }

  for (const template of TEMPLATE_FILES) {
    const existing = await prisma.templateFiles.findFirst({
      where: { fileName: template.fileName, isDeleted: false },
    });

    if (existing) {
      console.log(`↷ ${template.fileName} already present (id ${existing.id})`);
      continue;
    }

    const fileBuffer = await readFile(
      path.join(process.cwd(), "assets", template.fileName),
    );

    const created = await createTemplateFile({
      fileBuffer,
      filename: template.fileName,
      contentType: template.contentType,
      uploadedByUserId: admin.id,
    });

    console.log(`✅ ${created.fileName} (id ${created.id})`);
  }
}

async function main() {
  await assertSeedAllowed({ script: "seed-demo.ts" });

  console.log("Seeding dev demo dataset…");

  for (const step of SEED_STEPS) {
    runStep(step);
  }

  console.log("\n▶ template files");
  await seedTemplateFiles();

  console.log("\n✅ Dev demo dataset ready.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
