import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { downloadFile, getContentType } from "@/services/adminService";

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

    const stored = await downloadFile(id);

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
