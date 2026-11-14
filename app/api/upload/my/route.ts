import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-middleware";
import { listImports } from "@/services/importService";

/** Lists the caller's own imports, newest first (#202). */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const imports = await listImports({ userId: authResult.user.id });
    return NextResponse.json({ imports }, { status: 200 });
  } catch (error) {
    console.error("[upload/my] Failed to fetch imports:", error);
    return NextResponse.json(
      { error: "Failed to fetch your imports." },
      { status: 500 },
    );
  }
}
