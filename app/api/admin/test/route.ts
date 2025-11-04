import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";

// Test route to verify admin authentication
export async function GET(request: NextRequest) {
  const authResult = await requireAdminAuth(request);

  if (authResult instanceof NextResponse) {
    return authResult;
  }

  return NextResponse.json(
    {
      message: "Admin access confirmed",
      user: authResult.user.username,
      role: authResult.user.role,
    },
    { status: 200 }
  );
}
