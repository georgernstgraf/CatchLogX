import { prisma } from "@/lib/prisma";

type SpeciesRow = {
  id: number;
  speciesName: string; // EN common name
  germanName: string; // DE Trivialname
  latinName: string; // scientific name
  family: string; // family
};

const SPECIES: SpeciesRow[] = [
  {
    id: 1,
    speciesName: "Brown trout",
    germanName: "Bachforelle",
    latinName: "Salmo trutta",
    family: "Salmonidae",
  },
  {
    id: 2,
    speciesName: "Rainbow trout",
    germanName: "Regenbogenforelle",
    latinName: "Oncorhynchus mykiss",
    family: "Salmonidae",
  },
  {
    id: 3,
    speciesName: "European grayling",
    germanName: "Äsche",
    latinName: "Thymallus thymallus",
    family: "Salmonidae",
  },
  {
    id: 4,
    speciesName: "Danube salmon",
    germanName: "Huchen",
    latinName: "Hucho hucho",
    family: "Salmonidae",
  },
  {
    id: 5,
    speciesName: "Northern pike",
    germanName: "Hecht",
    latinName: "Esox lucius",
    family: "Esocidae",
  },
  {
    id: 6,
    speciesName: "European perch",
    germanName: "Flussbarsch",
    latinName: "Perca fluviatilis",
    family: "Percidae",
  },
  {
    id: 7,
    speciesName: "Pikeperch / Zander",
    germanName: "Zander",
    latinName: "Sander lucioperca",
    family: "Percidae",
  },
  {
    id: 8,
    speciesName: "Common roach",
    germanName: "Rotauge",
    latinName: "Rutilus rutilus",
    family: "Cyprinidae",
  },
  {
    id: 9,
    speciesName: "Common bream",
    germanName: "Brachse",
    latinName: "Abramis brama",
    family: "Cyprinidae",
  },
  {
    id: 10,
    speciesName: "Common carp",
    germanName: "Karpfen",
    latinName: "Cyprinus carpio",
    family: "Cyprinidae",
  },
  {
    id: 11,
    speciesName: "Crucian carp",
    germanName: "Karausche",
    latinName: "Carassius carassius",
    family: "Cyprinidae",
  },
  {
    id: 12,
    speciesName: "Tench",
    germanName: "Schleie",
    latinName: "Tinca tinca",
    family: "Cyprinidae",
  },
  {
    id: 13,
    speciesName: "Barbel",
    germanName: "Barbe",
    latinName: "Barbus barbus",
    family: "Cyprinidae",
  },
  {
    id: 14,
    speciesName: "Common dace",
    germanName: "Hasel",
    latinName: "Leuciscus leuciscus",
    family: "Cyprinidae",
  },
  {
    id: 15,
    speciesName: "Chub",
    germanName: "Döbel (Aitel)",
    latinName: "Squalius cephalus",
    family: "Cyprinidae",
  },
  {
    id: 16,
    speciesName: "Bleak",
    germanName: "Ukelei",
    latinName: "Alburnus alburnus",
    family: "Cyprinidae",
  },
  {
    id: 17,
    speciesName: "European bullhead",
    germanName: "Groppe (Mühlkoppe)",
    latinName: "Cottus gobio",
    family: "Cottidae",
  },
  {
    id: 18,
    speciesName: "Wels catfish",
    germanName: "Wels",
    latinName: "Silurus glanis",
    family: "Siluridae",
  },
  {
    id: 19,
    speciesName: "Burbot",
    germanName: "Quappe",
    latinName: "Lota lota",
    family: "Lotidae",
  },
  {
    id: 20,
    speciesName: "European eel",
    germanName: "Aal",
    latinName: "Anguilla anguilla",
    family: "Anguillidae",
  },
  {
    id: 21,
    speciesName: "Minnow",
    germanName: "Elritze",
    latinName: "Phoxinus phoxinus",
    family: "Cyprinidae",
  },
  {
    id: 22,
    speciesName: "Gudgeon",
    germanName: "Gründling",
    latinName: "Gobio gobio",
    family: "Cyprinidae",
  },
  {
    id: 23,
    speciesName: "Spined loach",
    germanName: "Steinbeißer",
    latinName: "Cobitis taenia",
    family: "Cobitidae",
  },
  {
    id: 24,
    speciesName: "European bitterling",
    germanName: "Bitterling",
    latinName: "Rhodeus amarus",
    family: "Cyprinidae",
  },
  {
    id: 25,
    speciesName: "Topmouth gudgeon",
    germanName: "Blaubandbärbling",
    latinName: "Pseudorasbora parva",
    family: "Cyprinidae",
  },
  {
    id: 26,
    speciesName: "Ruffe",
    germanName: "Kaulbarsch",
    latinName: "Gymnocephalus cernua",
    family: "Percidae",
  },
  {
    id: 27,
    speciesName: "Ide / Orfe",
    germanName: "Aland (Orfe)",
    latinName: "Leuciscus idus",
    family: "Cyprinidae",
  },
  {
    id: 28,
    speciesName: "Sea lamprey",
    germanName: "Meerneunauge",
    latinName: "Petromyzon marinus",
    family: "Petromyzontidae",
  },
  {
    id: 29,
    speciesName: "River lamprey",
    germanName: "Flussneunauge",
    latinName: "Lampetra fluviatilis",
    family: "Petromyzontidae",
  },
  {
    id: 30,
    speciesName: "Arctic char",
    germanName: "Seesaibling",
    latinName: "Salvelinus alpinus",
    family: "Salmonidae",
  },
];

async function main() {
  // ⚠️ Model-Name im Prisma Client prüfen:
  // In den meisten Schemas heißt das Model 'FishSpecies' -> Client: prisma.fishSpecies
  // Falls dein Model anders heißt, ändere die nächste Zeile entsprechend.
  await Promise.all(
    SPECIES.map((s) =>
      prisma.fishSpecies.upsert({
        where: { id: s.id },
        update: {
          speciesName: s.speciesName,
          germanName: s.germanName,
          latinName: s.latinName,
          family: s.family,
        },
        create: {
          id: s.id,
          speciesName: s.speciesName,
          germanName: s.germanName,
          latinName: s.latinName,
          family: s.family,
        },
      })
    )
  );

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
