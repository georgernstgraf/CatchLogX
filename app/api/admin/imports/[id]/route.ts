import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { deleteImport } from "@/services/importService";

/** Deletes any import (admin view, #202). */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminAuth(request);
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

    if (result.alreadyDeleted) {
      return NextResponse.json(
        { error: "Import has already been deleted" },
        { status: 409 },
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
    console.error("[ADMIN] Failed to delete import:", error);
    return NextResponse.json(
      { error: "Failed to delete the import." },
      { status: 500 },
    );
  }
}
