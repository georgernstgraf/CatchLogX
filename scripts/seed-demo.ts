import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { createTemplateFile } from "@/services/templateFileService";

/**
 * Dev-only demo seed. Idempotent: every step upserts by its natural key, and
 * the template files are only created when no live template file of that name
 * exists. Never run against production data.
 *
 * Usage: npm run seed:demo
 */

const SEED_STEPS = [
  "scripts/create-user.ts",
  "scripts/insert-fish.ts",
  "scripts/insert-river-sites.ts",
  "scripts/insert-samplings.ts",
  "scripts/insert-fish-catches.ts",
];

const TEMPLATE_FILES: { fileName: string; contentType: string }[] = [
  {
    fileName: "import-template.xlsx",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  { fileName: "import-template.csv", contentType: "text/csv" },
];

function runStep(script: string) {
  console.log(`\n▶ ${script}`);
  execSync(`npx tsx ${script}`, { stdio: "inherit" });
}

async function seedTemplateFiles() {
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) {
    throw new Error("Dev user 'admin' missing — run scripts/create-user.ts first.");
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
      path.join(process.cwd(), "samples", template.fileName),
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
