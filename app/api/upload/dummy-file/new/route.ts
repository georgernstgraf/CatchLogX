import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-middleware";
import { uploadDummyFile } from "@/lib/minio";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    const isExcel =
      contentType.includes(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ) || contentType.includes("application/octet-stream");

    if (!isExcel) {
      return NextResponse.json(
        {
          error:
            "Invalid content type. Please upload an .xlsx file as binary payload.",
        },
        { status: 400 },
      );
    }

    const fileBuffer = Buffer.from(await req.arrayBuffer());

    if (fileBuffer.length === 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty." },
        { status: 400 },
      );
    }

    const headerFilename = req.headers.get("x-file-name")?.trim();
    const filename =
      headerFilename && headerFilename.toLowerCase().endsWith(".xlsx")
        ? headerFilename
        : `dummy_file_${Date.now()}.xlsx`;

    const stored = await uploadDummyFile(fileBuffer, filename);

    return NextResponse.json(
      {
        message: "Dummy file uploaded successfully",
        filename: stored.filename,
        folder: stored.timestampFolder,
        objectKey: stored.objectKey,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("[dummy-file-upload] Upload failed:", error);

    return NextResponse.json(
      {
        error: "Failed to upload dummy file",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 },
    );
  }
}
