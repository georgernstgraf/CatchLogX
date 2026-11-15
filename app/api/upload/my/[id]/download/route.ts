import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-middleware";
import { getContentType, getImportFile } from "@/services/importService";

/**
 * Downloads the original file of one of the caller's own imports (#202).
 *
 * The admin panel uses `/api/admin/download/[id]`; this route exists so the
 * owner can take a copy before deleting an import.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { id } = await context.params;

    const stored = await getImportFile(id, {
      id: authResult.user.id,
      role: authResult.user.role,
    });

    if (!stored) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return new NextResponse(stored.fileBuffer as BodyInit, {
      headers: {
        "Content-Type": getContentType(),
        "Content-Disposition": `attachment; filename="${stored.fileName}"`,
        "Content-Length": stored.fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("[upload/my] Download error:", error);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
