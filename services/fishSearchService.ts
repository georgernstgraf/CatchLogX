import { prisma } from "@/lib/prisma";

interface FishSuggestion {
  id: number;
  speciesName: string;
  germanName: string | null;
  latinName: string | null;
  family: string | null;
}

export async function searchFish(query: string): Promise<FishSuggestion[]> {
  const suggestions: FishSuggestion[] = await prisma.fishSpecies.findMany({
    select: {
      speciesName: true,
      germanName: true,
      family: true,
      id: true,
      latinName: true,
    },
    where: {
      OR: [
        { speciesName: { contains: query, mode: "insensitive" } },
        { germanName: { contains: query, mode: "insensitive" } },
        { latinName: { contains: query, mode: "insensitive" } },
        { family: { contains: query, mode: "insensitive" } },
      ],
    },
  });

  return suggestions;
}
