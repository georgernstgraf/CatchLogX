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
    console.error("[ADMIN] Fehler beim Fetchen der Daten:", error);
    return NextResponse.json(
      { error: "Upload- und Nutzerdaten konnten nicht geladen werden" },
      { status: 500 },
    );
  }
}
