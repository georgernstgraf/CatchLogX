import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/admin-middleware";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { id } = await context.params;
    const body = await request.json();

    if (typeof body?.isVisible !== "boolean") {
      return NextResponse.json(
        { error: "isVisible must be a boolean." },
        { status: 400 },
      );
    }

    const updated = await prisma.dummyFiles.update({
      where: { id },
      data: {
        isVisible: body.isVisible,
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

    return NextResponse.json({ dummyFile: updated }, { status: 200 });
  } catch (error) {
    console.error("[dummy-file] Failed to update file:", error);
    return NextResponse.json(
      { error: "Failed to update dummy file." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { id } = await context.params;

    await prisma.dummyFiles.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    return NextResponse.json(
      { message: "Dummy file deleted." },
      { status: 200 },
    );
  } catch (error) {
    console.error("[dummy-file] Failed to delete file:", error);
    return NextResponse.json(
      { error: "Failed to delete dummy file." },
      { status: 500 },
    );
  }
}
