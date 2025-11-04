import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/admin-middleware";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Check admin authentication
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const sessionData = authResult;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { action, reason } = body;

    // Validate action
    if (!action || (action !== "accept" && action !== "deny")) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'accept' or 'deny'" },
        { status: 400 }
      );
    }

    // If denying, reason is required
    if (action === "deny" && !reason?.trim()) {
      return NextResponse.json(
        { error: "Reason is required when denying upload" },
        { status: 400 }
      );
    }

    // Check if upload exists
    const upload = await prisma.uploads.findUnique({
      where: { id },
      select: { id: true, link: true, state: true },
    });

    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    // Update upload state
    const newState = action === "accept" ? "accepted" : "denied";

    const updatedUpload = await prisma.uploads.update({
      where: { id },
      data: {
        note: reason,
        state: newState,
        updatedAt: new Date(),
      },
    });

    console.log(
      `[ADMIN] Upload ${action}ed by ${sessionData.user.username}:`,
      upload.link,
      reason ? `(Reason: ${reason})` : ""
    );

    return NextResponse.json(
      {
        message: `Upload ${action}ed successfully`,
        upload: updatedUpload,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[ADMIN] Error updating upload:", error);
    return NextResponse.json(
      { error: "Failed to update upload" },
      { status: 500 }
    );
  }
}
