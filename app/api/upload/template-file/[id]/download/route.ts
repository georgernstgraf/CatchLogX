import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getTemplateFileForDownload } from "@/services/templateFileService";

function guessContentType(fileName: string): string {
  if (fileName.toLowerCase().endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (fileName.toLowerCase().endsWith(".xls")) {
    return "application/vnd.ms-excel";
  }
  if (fileName.toLowerCase().endsWith(".csv")) {
    return "text/csv";
  }

  return "application/octet-stream";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const { id } = await context.params;

    const canSeeHidden =
      session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN";

    const templateFile = await getTemplateFileForDownload(id, canSeeHidden);

    // Unknown, deleted and hidden files are indistinguishable for the client.
    if (!templateFile) {
      return NextResponse.json(
        { error: "Template file not found." },
        { status: 404 },
      );
    }

    const fileBytes = new Uint8Array(templateFile.fileBuffer);

    return new NextResponse(fileBytes, {
      status: 200,
      headers: {
        "Content-Type": guessContentType(templateFile.fileName),
        "Content-Disposition": `attachment; filename="${templateFile.fileName}"`,
      },
    });
  } catch (error) {
    console.error("[template-file] Failed to download file:", error);
    return NextResponse.json(
      { error: "Failed to download template file." },
      { status: 500 },
    );
  }
}
