import speciesJson from "../assets/species.json";
import { prisma } from "@/lib/prisma";
import { syncSeedSequence } from "@/lib/seedSequences";

type SpeciesRow = {
  id: number;
  speciesName: string; // scientific name (matches Excel 'species' column)
  germanName: string;
  family: string | null;
};

// Species master data lives in assets/species.json (#183); the seed script
// only upserts it per id so existing ids stay stable.
const SPECIES: SpeciesRow[] = speciesJson;

async function main() {
  for (const s of SPECIES) {
    await prisma.fishSpecies.upsert({
      where: { id: s.id },
      update: {
        speciesName: s.speciesName,
        germanName: s.germanName,
        family: s.family,
      },
      create: {
        id: s.id,
        speciesName: s.speciesName,
        germanName: s.germanName,
        family: s.family,
      },
    });
  }

  await syncSeedSequence("fish_species");

  console.log(`✅ Insert/Update completed for ${SPECIES.length} species.`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
