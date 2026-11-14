import { prisma } from "@/lib/prisma";
import { assertSeedAllowed } from "@/lib/seedGuard";

async function main() {
  await assertSeedAllowed({ script: "wipe-and-seed.ts", destructive: true });

  console.log("Wiping fish_catches, samplings, river_sites, fish_species...");

  const fc = await prisma.fishCatch.deleteMany();
  console.log(`Deleted ${fc.count} fish_catches`);

  const s = await prisma.sampling.deleteMany();
  console.log(`Deleted ${s.count} samplings`);

  const rs = await prisma.riverSite.deleteMany();
  console.log(`Deleted ${rs.count} river_sites`);

  const fs = await prisma.fishSpecies.deleteMany();
  console.log(`Deleted ${fs.count} fish_species`);

  // Imports and their stored original files (#202). The import rows go first:
  // `Imports.blobId` is ON DELETE RESTRICT. Only blobs nothing references any
  // more are removed — template files stay.
  const im = await prisma.imports.deleteMany();
  console.log(`Deleted ${im.count} imports`);

  const blobs = await prisma.fileBlob.deleteMany({
    where: { imports: { none: {} }, templateFiles: { none: {} } },
  });
  console.log(`Deleted ${blobs.count} orphaned file blobs`);

  // Reset sequences
  await prisma.$executeRawUnsafe(
    "SELECT setval('fish_catches_id_seq', 1, false)",
  );
  await prisma.$executeRawUnsafe("SELECT setval('samplings_id_seq', 1, false)");
  await prisma.$executeRawUnsafe(
    "SELECT setval('river_sites_id_seq', 1, false)",
  );
  await prisma.$executeRawUnsafe(
    "SELECT setval('fish_species_id_seq', 1, false)",
  );
  console.log("Sequences reset to 1.");

  // Import the full species list from insert-fish.ts
  const { execSync } = await import("child_process");
  execSync("npx tsx scripts/demo/insert-fish.ts", { stdio: "inherit" });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
