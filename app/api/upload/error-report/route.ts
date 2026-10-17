import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-middleware";
import { getArchive, pruneArchives } from "@/lib/errorArchive";

/**
 * Streams the annotated error files of a failed bulk upload (#88). The archive
 * lives in memory under a short-lived token and is never persisted.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  pruneArchives();

  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const archive = getArchive(token);
  if (!archive) {
    return NextResponse.json(
      { error: "The error report has expired or does not exist." },
      { status: 404 },
    );
  }

  return new NextResponse(archive as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="upload_errors.zip"',
      "Content-Length": archive.length.toString(),
    },
  });
}
