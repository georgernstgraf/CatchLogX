import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-middleware";
import { deleteImport } from "@/services/importService";

/**
 * Deletes one of the caller's own imports (#202): catches, samplings, the
 * original file and the `Imports` row itself — nothing is left behind (#184).
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { id } = await context.params;

    const result = await deleteImport(id, {
      id: authResult.user.id,
      role: authResult.user.role,
    });

    if (result.notFound) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (result.forbidden) {
      return NextResponse.json(
        { error: "You can only delete your own imports" },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        message: "Import deleted",
        catches: result.catches,
        samplings: result.samplings,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[upload/my] Failed to delete import:", error);
    return NextResponse.json(
      { error: "Failed to delete the import." },
      { status: 500 },
    );
  }
}
