import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import {
  setTemplateFileVisibility,
  softDeleteTemplateFile,
} from "@/services/templateFileService";

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

    const updated = await setTemplateFileVisibility(id, body.isVisible);

    return NextResponse.json({ templateFile: updated }, { status: 200 });
  } catch (error) {
    console.error("[template-file] Failed to update file:", error);
    return NextResponse.json(
      { error: "Failed to update template file." },
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

    await softDeleteTemplateFile(id);

    return NextResponse.json(
      { message: "Template file deleted." },
      { status: 200 },
    );
  } catch (error) {
    console.error("[template-file] Failed to delete file:", error);
    return NextResponse.json(
      { error: "Failed to delete template file." },
      { status: 500 },
    );
  }
}
