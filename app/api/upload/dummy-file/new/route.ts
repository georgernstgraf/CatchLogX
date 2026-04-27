import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { uploadDummyFile } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const authResult = await requireAdminAuth(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    const headerFilename = req.headers.get("x-file-name")?.trim();
    const lowerFilename = (headerFilename ?? "").toLowerCase();
    const isExcel =
      contentType.includes(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ) ||
      contentType.includes("application/vnd.ms-excel") ||
      contentType.includes("text/csv") ||
      contentType.includes("text/plain") ||
      contentType.includes("application/octet-stream") ||
      lowerFilename.endsWith(".xlsx") ||
      lowerFilename.endsWith(".xls") ||
      lowerFilename.endsWith(".csv") ||
      lowerFilename.endsWith(".txt");

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

    const filename =
      headerFilename &&
      [".xlsx", ".xls", ".csv", ".txt"].some((ext) =>
        headerFilename.toLowerCase().endsWith(ext),
      )
        ? headerFilename
        : `dummy_file_${Date.now()}.xlsx`;

    const stored = await uploadDummyFile(
      fileBuffer,
      filename,
      contentType || "application/octet-stream",
    );

    const dummyFile = await prisma.dummyFiles.create({
      data: {
        fileName: stored.filename,
        filePath: stored.objectKey,
        uploadedByUserId: authResult.user.id,
        isVisible: true,
        isDeleted: false,
      },
      select: {
        id: true,
        fileName: true,
        filePath: true,
        uploadedByUserId: true,
        createdAt: true,
        isVisible: true,
      },
    });

    return NextResponse.json(
      {
        message: "Dummy file uploaded successfully",
        dummyFile,
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
