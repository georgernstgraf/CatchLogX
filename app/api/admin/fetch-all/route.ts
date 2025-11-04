import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";

export async function GET(request: NextRequest) {
  // Check admin authentication
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });
    const uploads = await prisma.uploads.findMany({
      select: {
        id: true,
        link: true,
        state: true,
        uploaded_by: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        uploads: uploads,
        users: users,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[ADMIN] Fehler beim Fetchen der Daten:", error);
    return NextResponse.json(
      { error: "Upload- und Nutzerdaten konnten nicht geladen werden" },
      { status: 500 }
    );
  }
}
