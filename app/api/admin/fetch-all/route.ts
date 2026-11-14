import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { fetchAllData } from "@/services/adminService";

export async function GET(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { uploads, users } = await fetchAllData();

    return NextResponse.json(
      {
        uploads: uploads,
        users: users,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[ADMIN] Failed to fetch data:", error);
    return NextResponse.json(
      { error: "Could not load upload and user data" },
      { status: 500 },
    );
  }
}
