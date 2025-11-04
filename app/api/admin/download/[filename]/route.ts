import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireAdminAuth } from "@/lib/admin-middleware";

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  // Check admin authentication
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { filename } = await params;

    // Construct file path
    const filePath = path.join("uploads", filename);
    console.log(filePath);

    // Check if file exists
    await fs.access(filePath);

    // Read file
    const fileBuffer = await fs.readFile(filePath);

    const contentType = getContentType();

    // Return file with appropriate headers
    return new NextResponse(fileBuffer as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}

function getContentType(): string {
  // Always return Excel content type since files are always Excel files
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}
