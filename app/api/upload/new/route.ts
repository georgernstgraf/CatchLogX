import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-middleware";
import { processBulkUpload, type BulkUploadFile } from "@/services/uploadService";
import { MAX_UPLOAD_FILES, MAX_UPLOAD_TOTAL_BYTES, MAX_UPLOAD_FILE_BYTES } from "@/lib/uploadReport";

const MAX_TOTAL_MB = Math.round(MAX_UPLOAD_TOTAL_BYTES / (1024 * 1024));
const MAX_FILE_MB = Math.round(MAX_UPLOAD_FILE_BYTES / (1024 * 1024));

/** Reads the uploaded files from either multipart form data or a raw body. */
async function readUploadedFiles(req: NextRequest): Promise<BulkUploadFile[]> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const entries = form
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    return Promise.all(
      entries.map(async (entry) => ({
        fileName: entry.name || "upload.xlsx",
        buffer: Buffer.from(await entry.arrayBuffer()),
      })),
    );
  }

  // Raw body fallback: a single file (curl-friendly, also used by tests).
  const buffer = Buffer.from(await req.arrayBuffer());
  const headerName = req.headers.get("x-file-name")?.trim();
  return [{ fileName: headerName || "upload.xlsx", buffer }];
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const files = await readUploadedFiles(req);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No files were uploaded." },
        { status: 400 },
      );
    }

    if (files.length > MAX_UPLOAD_FILES) {
      return NextResponse.json(
        { error: `Too many files: at most ${MAX_UPLOAD_FILES} per upload.` },
        { status: 400 },
      );
    }

    const totalBytes = files.reduce((sum, file) => sum + file.buffer.length, 0);
    if (totalBytes > MAX_UPLOAD_TOTAL_BYTES) {
      return NextResponse.json(
        {
          error: `Upload too large: at most ${MAX_TOTAL_MB} MiB in total.`,
        },
        { status: 400 },
      );
    }

    // Reject oversized single files before parsing anything (#132): the whole
    // workbook is held in memory, so a pathological file must not reach the
    // validator at all.
    const oversized = files.find(
      (file) => file.buffer.length > MAX_UPLOAD_FILE_BYTES,
    );
    if (oversized) {
      return NextResponse.json(
        {
          error: `File too large: "${oversized.fileName}" exceeds the ${MAX_FILE_MB} MiB per-file limit.`,
        },
        { status: 400 },
      );
    }

    const result = await processBulkUpload(files, authResult.user.id);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          report: result.report,
          zipToken: result.zipToken,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      message: "Upload successful",
      report: result.report,
      uploads: result.uploads,
    });
  } catch (err: any) {
    console.error("Server error during upload:", err);
    return NextResponse.json(
      { error: "Server error", details: err.message },
      { status: 500 },
    );
  }
}
