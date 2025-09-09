import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// SQL Query validieren
function validateSQLQuery(query: string): { isValid: boolean; error?: string } {
  if (!query || typeof query !== "string") {
    return { isValid: false, error: "Query ist leer oder kein String" };
  }

  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return { isValid: false, error: "Query ist leer" };
  }

  const dangerousTables = ["USER", "SESSION", "PASSWORDRESETS", "UPLOADS"];

  for (const table of dangerousTables) {
    if (trimmedQuery.toUpperCase().includes(table.toUpperCase())) {
      return {
        isValid: false,
        error: `Gefährliche Operation erkannt: ${table} darf nicht abgefragt werden.`,
      };
    }
  }

  // Gefährliche Operationen verhindern
  const dangerousKeywords = [
    "DROP",
    "DELETE",
    "TRUNCATE",
    "ALTER",
    "CREATE",
    "INSERT",
    "UPDATE",
  ];
  const upperQuery = trimmedQuery.toUpperCase();

  for (const keyword of dangerousKeywords) {
    if (upperQuery.includes(keyword)) {
      return {
        isValid: false,
        error: `Gefährliche Operation erkannt: ${keyword}. Nur SELECT-Queries sind erlaubt.`,
      };
    }
  }

  // Nur SELECT-Queries erlauben
  if (!upperQuery.startsWith("SELECT")) {
    return { isValid: false, error: "Nur SELECT-Queries sind erlaubt" };
  }

  // Klammern prüfen
  const openParens = (trimmedQuery.match(/\(/g) || []).length;
  const closeParens = (trimmedQuery.match(/\)/g) || []).length;

  if (openParens !== closeParens) {
    return {
      isValid: false,
      error: "Ungleiche Anzahl von öffnenden und schließenden Klammern",
    };
  }

  return { isValid: true };
}

export async function POST(req: NextRequest) {
  let query: string = "";

  try {
    const requestData = await req.json();
    query = requestData.query;

    // SQL Query validieren
    const validation = validateSQLQuery(query);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          error: "SQL Query Validierung fehlgeschlagen",
          details: validation.error,
          query: query,
        },
        { status: 400 }
      );
    }

    // Query direkt ausführen ohne Parameter-Substitution
    const data = await prisma.$queryRawUnsafe(query);

    return NextResponse.json({
      message: "Query erfolgreich ausgeführt.",
      data: {
        timestamp: new Date(),
        query: query,
        result: data,
      },
    });
  } catch (error) {
    console.error("Database query error:", error);

    return NextResponse.json(
      {
        error: "Datenbankfehler beim Ausführen der Query",
        details: error instanceof Error ? error.message : "Unbekannter Fehler",
        query: query,
      },
      { status: 500 }
    );
  }
}
