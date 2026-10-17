import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getDummyFileForDownload } from "@/services/dummyFileService";

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

    const dummyFile = await getDummyFileForDownload(id, canSeeHidden);

    // Unknown, deleted and hidden files are indistinguishable for the client.
    if (!dummyFile) {
      return NextResponse.json(
        { error: "Dummy file not found." },
        { status: 404 },
      );
    }

    const fileBytes = new Uint8Array(dummyFile.fileBuffer);

    return new NextResponse(fileBytes, {
      status: 200,
      headers: {
        "Content-Type": guessContentType(dummyFile.fileName),
        "Content-Disposition": `attachment; filename="${dummyFile.fileName}"`,
      },
    });
  } catch (error) {
    console.error("[dummy-file] Failed to download file:", error);
    return NextResponse.json(
      { error: "Failed to download dummy file." },
      { status: 500 },
    );
  }
}
