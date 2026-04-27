import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { requireAuth } from "@/lib/auth-middleware";

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
    const dummyFiles = await prisma.dummyFiles.findMany({
      where: {
        OR: [{ isDeleted: false }, { isDeleted: null }],
        ...(includeHidden ? {} : { isVisible: true }),
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        fileName: true,
        filePath: true,
        uploadedByUserId: true,
        createdAt: true,
        isVisible: true,
      },
    });

    return NextResponse.json({ dummyFiles }, { status: 200 });
  } catch (error) {
    console.error("[dummy-file] Failed to fetch files:", error);
    return NextResponse.json(
      { error: "Failed to fetch dummy files." },
      { status: 500 },
    );
  }
}
