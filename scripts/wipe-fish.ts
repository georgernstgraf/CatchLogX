import { prisma } from "@/lib/prisma";

async function main() {
  try {
    await prisma.fishSpecies.deleteMany();
    console.log("Alle Fischi gelöschti");
  } catch (e) {
    console.error("Problemi beim Fischi löschi", e);
  }
}

main();
