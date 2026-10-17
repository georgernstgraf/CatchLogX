import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { requireAuth } from "@/lib/auth-middleware";
import { listDummyFiles } from "@/services/dummyFileService";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const includeHidden = searchParams.get("includeHidden") === "true";

  if (includeHidden) {
    const authResult = await requireAdminAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
  } else {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
  }

  try {
    const dummyFiles = await listDummyFiles(includeHidden);

    return NextResponse.json({ dummyFiles }, { status: 200 });
  } catch (error) {
    console.error("[dummy-file] Failed to fetch files:", error);
    return NextResponse.json(
      { error: "Failed to fetch dummy files." },
      { status: 500 },
    );
  }
}
