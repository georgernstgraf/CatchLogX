import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

interface FishSuggestion {
  id: number;
  speciesName: string;
  germanName: string;
  latinName: string;
  family: string;
}

interface SearchResponse {
  success: boolean;
  suggestions?: FishSuggestion[];
  message?: string;
  count?: number;
}

export async function GET(
  req: NextRequest
): Promise<NextResponse<SearchResponse>> {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("q")?.trim();

    // Eingabevalidierung
    if (!query) {
      console.log("Warnung: Leerer Suchbegriff empfangen");
      return NextResponse.json(
        {
          success: true,
          suggestions: [],
          count: 0,
          message: "Kein Suchbegriff angegeben",
        },
        { status: 200 }
      );
    }

    const searchPattern = `%${query}%`;

    // Datenbankabfrage
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

    const suggestionCount = suggestions.length;

    return NextResponse.json(
      {
        success: true,
        suggestions,
        count: suggestionCount,
        message:
          suggestionCount === 0 ? "Keine Fischarten gefunden" : undefined,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Fehler beim Durchsuchen der Datenbank:", error);

    // Detailliert
    if (error instanceof Error) {
      console.error("Fehlermeldung:", error.message);
      console.error("Stack Trace:", error.stack);
    }

    return NextResponse.json(
      {
        success: false,
        suggestions: [],
        count: 0,
        message: "Ein Fehler ist bei der Suche aufgetreten",
      },
      { status: 500 }
    );
  }
}
