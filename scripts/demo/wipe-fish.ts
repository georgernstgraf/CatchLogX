import { prisma } from "@/lib/prisma";
import { assertSeedAllowed } from "@/lib/seedGuard";

// Deletes the species master only. It cannot work while catches reference a
// species (`fish_catches.speciesId` is ON DELETE RESTRICT), so it exists for a
// half-written seed, not for cleanup — use wipe-and-seed.ts for that.
async function main() {
  await assertSeedAllowed({ script: "wipe-fish.ts", destructive: true });

  try {
    await prisma.fishSpecies.deleteMany();
    console.log("Alle Fischi gelöschti");
  } catch (e) {
    console.error("Problemi beim Fischi löschi", e);
  }
}

main();
