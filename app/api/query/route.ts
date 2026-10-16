import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import {
  validateSQLQuery,
  executeQuery,
  isPermissionDenied,
} from "@/services/queryService";

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

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

    const data = await executeQuery(query, session.user.id);

    return NextResponse.json({
      message: "Query erfolgreich ausgeführt.",
      data,
    });
  } catch (error) {
    console.error("Database query error:", error);

    if (isPermissionDenied(error)) {
      const message =
        "Keine Berechtigung für diese Tabelle/Operation – nur Lesezugriff auf Fangdaten.";
      return NextResponse.json(
        {
          error: message,
          details: message,
          query: query,
        },
        { status: 403 },
      );
    }

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
