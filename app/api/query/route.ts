import { NextRequest, NextResponse } from "next/server";
import { validateSQLQuery, executeQuery } from "@/services/queryService";

export async function POST(req: NextRequest) {
  let query: string = "";

  try {
    const requestData = await req.json();
    query = requestData.query;

    const validation = validateSQLQuery(query);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          error: "SQL Query Validierung fehlgeschlagen",
          details: validation.error,
          query: query,
        },
        { status: 400 },
      );
    }

    const data = await executeQuery(query);

    return NextResponse.json({
      message: "Query erfolgreich ausgeführt.",
      data,
    });
  } catch (error) {
    console.error("Database query error:", error);

    return NextResponse.json(
      {
        error: "Datenbankfehler beim Ausführen der Query",
        details: error instanceof Error ? error.message : "Unbekannter Fehler",
        query: query,
      },
      { status: 500 },
    );
  }
}
