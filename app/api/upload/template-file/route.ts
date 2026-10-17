import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { requireAuth } from "@/lib/auth-middleware";
import { listTemplateFiles } from "@/services/templateFileService";

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
    const templateFiles = await listTemplateFiles(includeHidden);

    return NextResponse.json({ templateFiles }, { status: 200 });
  } catch (error) {
    console.error("[template-file] Failed to fetch files:", error);
    return NextResponse.json(
      { error: "Failed to fetch template files." },
      { status: 500 },
    );
  }
}
