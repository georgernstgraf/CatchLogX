import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { getContentType, getImportFile } from "@/services/importService";

/** Downloads the stored original file of an import (#202). */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { id } = await context.params;

    const stored = await getImportFile(id);

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
    console.error("Download error:", error);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
