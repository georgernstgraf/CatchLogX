import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-middleware";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const uploads = await prisma.uploads.findMany({
      where: {
        uploaded_by: authResult.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        link: true,
        state: true,
        note: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ uploads }, { status: 200 });
  } catch (error) {
    console.error("[upload/my] Failed to fetch uploads:", error);
    return NextResponse.json(
      { error: "Failed to fetch your uploads." },
      { status: 500 },
    );
  }
}
