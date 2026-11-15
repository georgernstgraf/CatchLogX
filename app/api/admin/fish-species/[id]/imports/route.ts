import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { listSpeciesImports } from "@/services/fishSpeciesService";

/**
 * The imports a species comes from, newest first (#224).
 *
 * Loaded on demand when the admin expands the catch count in the species
 * table, so the species list itself stays one query.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id)) {
      return NextResponse.json(
        { error: "Invalid species id" },
        { status: 400 },
      );
    }

    const imports = await listSpeciesImports(id);

    if (imports === null) {
      return NextResponse.json(
        { error: "Fish species not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ imports }, { status: 200 });
  } catch (error) {
    console.error("[ADMIN] Error listing imports of a fish species:", error);
    return NextResponse.json(
      { error: "Failed to load the imports of this species" },
      { status: 500 },
    );
  }
}
