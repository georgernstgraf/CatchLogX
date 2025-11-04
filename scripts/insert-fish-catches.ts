import { prisma } from "@/lib/prisma";

type FishCatchRow = {
  id: number;
  samplingId: number;
  fishId?: string;
  speciesId: number;
  lengthMm?: number;
  totalWeightGr?: number;
};

const FISH_CATCHES: FishCatchRow[] = [
  // Sampling 1 - Donau Wien (verschiedene Arten)
  {
    id: 1,
    samplingId: 1,
    fishId: "DON001-001",
    speciesId: 1, // Brown trout
    lengthMm: 285,
    totalWeightGr: 320.5,
  },
  {
    id: 2,
    samplingId: 1,
    fishId: "DON001-002",
    speciesId: 5, // Northern pike
    lengthMm: 420,
    totalWeightGr: 850.2,
  },
  {
    id: 3,
    samplingId: 1,
    fishId: "DON001-003",
    speciesId: 6, // European perch
    lengthMm: 185,
    totalWeightGr: 125.8,
  },
  {
    id: 4,
    samplingId: 1,
    fishId: "DON001-004",
    speciesId: 12, // Common roach
    lengthMm: 220,
    totalWeightGr: 180.3,
  },
  {
    id: 5,
    samplingId: 1,
    fishId: "DON001-005",
    speciesId: 7, // Zander
    lengthMm: 380,
    totalWeightGr: 520.7,
  },

  // Sampling 2 - Donau Krems
  {
    id: 6,
    samplingId: 2,
    fishId: "DON002-001",
    speciesId: 4, // Danube salmon (Huchen)
    lengthMm: 650,
    totalWeightGr: 2100.0,
  },
  {
    id: 7,
    samplingId: 2,
    fishId: "DON002-002",
    speciesId: 1, // Brown trout
    lengthMm: 295,
    totalWeightGr: 340.1,
  },
  {
    id: 8,
    samplingId: 2,
    fishId: "DON002-003",
    speciesId: 13, // Common bream
    lengthMm: 315,
    totalWeightGr: 425.6,
  },

  // Sampling 3 - Inn Innsbruck (Forellen dominiert)
  {
    id: 9,
    samplingId: 3,
    fishId: "INN001-001",
    speciesId: 1, // Brown trout
    lengthMm: 240,
    totalWeightGr: 195.4,
  },
  {
    id: 10,
    samplingId: 3,
    fishId: "INN001-002",
    speciesId: 2, // Rainbow trout
    lengthMm: 265,
    totalWeightGr: 245.8,
  },
  {
    id: 11,
    samplingId: 3,
    fishId: "INN001-003",
    speciesId: 3, // European grayling
    lengthMm: 320,
    totalWeightGr: 285.2,
  },
  {
    id: 12,
    samplingId: 3,
    fishId: "INN001-004",
    speciesId: 1, // Brown trout
    lengthMm: 180,
    totalWeightGr: 85.5,
  },

  // Sampling 4 - Enns Steyr
  {
    id: 13,
    samplingId: 4,
    fishId: "ENS001-001",
    speciesId: 1, // Brown trout
    lengthMm: 275,
    totalWeightGr: 285.9,
  },
  {
    id: 14,
    samplingId: 4,
    fishId: "ENS001-002",
    speciesId: 3, // European grayling
    lengthMm: 340,
    totalWeightGr: 315.7,
  },
  {
    id: 15,
    samplingId: 4,
    fishId: "ENS001-003",
    speciesId: 11, // European chub
    lengthMm: 280,
    totalWeightGr: 220.4,
  },

  // Sampling 5 - Salzach Salzburg
  {
    id: 16,
    samplingId: 5,
    fishId: "SAL001-001",
    speciesId: 1, // Brown trout
    lengthMm: 255,
    totalWeightGr: 215.3,
  },
  {
    id: 17,
    samplingId: 5,
    fishId: "SAL001-002",
    speciesId: 2, // Rainbow trout
    lengthMm: 230,
    totalWeightGr: 175.2,
  },
  {
    id: 18,
    samplingId: 5,
    fishId: "SAL001-003",
    speciesId: 3, // European grayling
    lengthMm: 295,
    totalWeightGr: 245.8,
  },
  {
    id: 19,
    samplingId: 5,
    fishId: "SAL001-004",
    speciesId: 8, // Common barbel
    lengthMm: 385,
    totalWeightGr: 465.1,
  },

  // Sampling 6 - Traun Gmunden (sehr klar, Forellen)
  {
    id: 20,
    samplingId: 6,
    fishId: "TRA001-001",
    speciesId: 1, // Brown trout
    lengthMm: 310,
    totalWeightGr: 385.7,
  },
  {
    id: 21,
    samplingId: 6,
    fishId: "TRA001-002",
    speciesId: 1, // Brown trout
    lengthMm: 195,
    totalWeightGr: 95.3,
  },
  {
    id: 22,
    samplingId: 6,
    fishId: "TRA001-003",
    speciesId: 3, // European grayling
    lengthMm: 275,
    totalWeightGr: 205.4,
  },

  // Sampling 7 - Kamp Zwettl (kleiner Fluss)
  {
    id: 23,
    samplingId: 7,
    fishId: "KAM001-001",
    speciesId: 1, // Brown trout
    lengthMm: 165,
    totalWeightGr: 65.2,
  },
  {
    id: 24,
    samplingId: 7,
    fishId: "KAM001-002",
    speciesId: 15, // Stone loach
    lengthMm: 85,
    totalWeightGr: 8.5,
  },
  {
    id: 25,
    samplingId: 7,
    fishId: "KAM001-003",
    speciesId: 1, // Brown trout
    lengthMm: 145,
    totalWeightGr: 45.8,
  },

  // Sampling 8 - Mur Graz
  {
    id: 26,
    samplingId: 8,
    fishId: "MUR001-001",
    speciesId: 1, // Brown trout
    lengthMm: 205,
    totalWeightGr: 125.6,
  },
  {
    id: 27,
    samplingId: 8,
    fishId: "MUR001-002",
    speciesId: 6, // European perch
    lengthMm: 195,
    totalWeightGr: 145.2,
  },
  {
    id: 28,
    samplingId: 8,
    fishId: "MUR001-003",
    speciesId: 11, // European chub
    lengthMm: 265,
    totalWeightGr: 195.8,
  },
  {
    id: 29,
    samplingId: 8,
    fishId: "MUR001-004",
    speciesId: 12, // Common roach
    lengthMm: 185,
    totalWeightGr: 125.4,
  },

  // Sampling 9 - Pielach Loosdorf (naturnaher Zustand)
  {
    id: 30,
    samplingId: 9,
    fishId: "PIE001-001",
    speciesId: 1, // Brown trout
    lengthMm: 225,
    totalWeightGr: 155.7,
  },
  {
    id: 31,
    samplingId: 9,
    fishId: "PIE001-002",
    speciesId: 1, // Brown trout
    lengthMm: 185,
    totalWeightGr: 85.3,
  },
  {
    id: 32,
    samplingId: 9,
    fishId: "PIE001-003",
    speciesId: 14, // European bullhead
    lengthMm: 95,
    totalWeightGr: 12.8,
  },

  // Sampling 10 - Ybbs Amstetten
  {
    id: 33,
    samplingId: 10,
    fishId: "YBB001-001",
    speciesId: 1, // Brown trout
    lengthMm: 245,
    totalWeightGr: 185.9,
  },
  {
    id: 34,
    samplingId: 10,
    fishId: "YBB001-002",
    speciesId: 3, // European grayling
    lengthMm: 305,
    totalWeightGr: 265.4,
  },
  {
    id: 35,
    samplingId: 10,
    fishId: "YBB001-003",
    speciesId: 11, // European chub
    lengthMm: 235,
    totalWeightGr: 165.7,
  },
  {
    id: 36,
    samplingId: 10,
    fishId: "YBB001-004",
    speciesId: 1, // Brown trout
    lengthMm: 155,
    totalWeightGr: 55.2,
  },

  // Zusätzliche Fänge für bessere Datenverteilung
  {
    id: 37,
    samplingId: 1,
    fishId: "DON001-006",
    speciesId: 13, // Common bream
    lengthMm: 285,
    totalWeightGr: 365.8,
  },
  {
    id: 38,
    samplingId: 2,
    fishId: "DON002-004",
    speciesId: 5, // Northern pike
    lengthMm: 385,
    totalWeightGr: 695.4,
  },
  {
    id: 39,
    samplingId: 3,
    fishId: "INN001-005",
    speciesId: 1, // Brown trout
    lengthMm: 165,
    totalWeightGr: 75.6,
  },
  {
    id: 40,
    samplingId: 4,
    fishId: "ENS001-004",
    speciesId: 6, // European perch
    lengthMm: 175,
    totalWeightGr: 95.3,
  },
  {
    id: 41,
    samplingId: 5,
    fishId: "SAL001-005",
    speciesId: 1, // Brown trout
    lengthMm: 285,
    totalWeightGr: 295.7,
  },
  {
    id: 42,
    samplingId: 6,
    fishId: "TRA001-004",
    speciesId: 2, // Rainbow trout
    lengthMm: 245,
    totalWeightGr: 185.9,
  },
  {
    id: 43,
    samplingId: 7,
    fishId: "KAM001-004",
    speciesId: 15, // Stone loach
    lengthMm: 75,
    totalWeightGr: 6.2,
  },
  {
    id: 44,
    samplingId: 8,
    fishId: "MUR001-005",
    speciesId: 1, // Brown trout
    lengthMm: 215,
    totalWeightGr: 145.8,
  },
  {
    id: 45,
    samplingId: 9,
    fishId: "PIE001-004",
    speciesId: 14, // European bullhead
    lengthMm: 105,
    totalWeightGr: 15.3,
  },
  {
    id: 46,
    samplingId: 10,
    fishId: "YBB001-005",
    speciesId: 8, // Common barbel
    lengthMm: 325,
    totalWeightGr: 385.6,
  },
  {
    id: 47,
    samplingId: 1,
    fishId: "DON001-007",
    speciesId: 9, // Common nase
    lengthMm: 295,
    totalWeightGr: 245.7,
  },
  {
    id: 48,
    samplingId: 2,
    fishId: "DON002-005",
    speciesId: 10, // European catfish
    lengthMm: 850,
    totalWeightGr: 4500.0,
  },
  {
    id: 49,
    samplingId: 3,
    fishId: "INN001-006",
    speciesId: 2, // Rainbow trout
    lengthMm: 195,
    totalWeightGr: 125.4,
  },
  {
    id: 50,
    samplingId: 4,
    fishId: "ENS001-005",
    speciesId: 1, // Brown trout
    lengthMm: 205,
    totalWeightGr: 115.8,
  },
];

async function main() {
  console.log("🐟 Inserting fish catches...");

  await Promise.all(
    FISH_CATCHES.map((fishCatch) =>
      prisma.fishCatch.upsert({
        where: { id: fishCatch.id },
        update: {
          samplingId: fishCatch.samplingId,
          fishId: fishCatch.fishId,
          speciesId: fishCatch.speciesId,
          lengthMm: fishCatch.lengthMm,
          totalWeightGr: fishCatch.totalWeightGr,
        },
        create: {
          id: fishCatch.id,
          samplingId: fishCatch.samplingId,
          fishId: fishCatch.fishId,
          speciesId: fishCatch.speciesId,
          lengthMm: fishCatch.lengthMm,
          totalWeightGr: fishCatch.totalWeightGr,
        },
      })
    )
  );

  console.log(
    `✅ Insert/Update completed for ${FISH_CATCHES.length} fish catches.`
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
