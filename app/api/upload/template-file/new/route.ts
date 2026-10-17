import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { createTemplateFile } from "@/services/templateFileService";

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
        : `template_file_${Date.now()}.xlsx`;

    const templateFile = await createTemplateFile({
      fileBuffer,
      filename,
      contentType: contentType || "application/octet-stream",
      uploadedByUserId: authResult.user.id,
    });

    return NextResponse.json(
      {
        message: "Template file uploaded successfully",
        templateFile,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("[template-file-upload] Upload failed:", error);

    return NextResponse.json(
      {
        error: "Failed to upload template file",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 },
    );
  }
}
