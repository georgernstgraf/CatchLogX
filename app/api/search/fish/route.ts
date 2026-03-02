import { NextRequest, NextResponse } from "next/server";
import { searchFish } from "@/services/fishSearchService";

interface FishSuggestion {
  id: number;
  speciesName: string;
  germanName: string | null;
  latinName: string | null;
  family: string | null;
}

interface SearchResponse {
  success: boolean;
  suggestions?: FishSuggestion[];
  message?: string;
  count?: number;
}

export async function GET(
  req: NextRequest,
): Promise<NextResponse<SearchResponse>> {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("q")?.trim();

    if (!query) {
      console.log("Warnung: Leerer Suchbegriff empfangen");
      return NextResponse.json(
        {
          success: true,
          suggestions: [],
          count: 0,
          message: "Kein Suchbegriff angegeben",
        },
        { status: 200 },
      );
    }

    const suggestions = await searchFish(query);
    const suggestionCount = suggestions.length;

    return NextResponse.json(
      {
        success: true,
        suggestions,
        count: suggestionCount,
        message:
          suggestionCount === 0 ? "Keine Fischarten gefunden" : undefined,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Fehler beim Durchsuchen der Datenbank:", error);

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
      { status: 500 },
    );
  }
}
