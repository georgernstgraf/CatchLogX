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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
      message: "Query executed successfully.",
      data,
    });
  } catch (error) {
    console.error("Database query error:", error);

    if (isPermissionDenied(error)) {
      const message =
        "No permission for this table or operation — read-only access to catch data.";
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
        error: "Database error while running the query",
        details: error instanceof Error ? error.message : "Unknown error",
        query: query,
      },
      { status: 500 },
    );
  }
}
