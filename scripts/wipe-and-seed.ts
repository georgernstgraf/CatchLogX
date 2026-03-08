import { prisma } from "@/lib/prisma";

async function main() {
  console.log("Wiping fish_catches, samplings, river_sites, fish_species...");

  const fc = await prisma.fishCatch.deleteMany();
  console.log(`Deleted ${fc.count} fish_catches`);

  const s = await prisma.sampling.deleteMany();
  console.log(`Deleted ${s.count} samplings`);

  const rs = await prisma.riverSite.deleteMany();
  console.log(`Deleted ${rs.count} river_sites`);

  const fs = await prisma.fishSpecies.deleteMany();
  console.log(`Deleted ${fs.count} fish_species`);

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
  execSync("npx tsx scripts/insert-fish.ts", { stdio: "inherit" });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
