import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { updateUpload } from "@/services/adminService";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const sessionData = authResult;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { action, reason } = body;

    if (!action || (action !== "accept" && action !== "deny")) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'accept' or 'deny'" },
        { status: 400 },
      );
    }

    if (action === "deny" && !reason?.trim()) {
      return NextResponse.json(
        { error: "Reason is required when denying upload" },
        { status: 400 },
      );
    }

    const updatedUpload = await updateUpload(
      id,
      action,
      reason,
      sessionData.user.username,
    );

    if (!updatedUpload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        message: `Upload ${action}ed successfully`,
        upload: updatedUpload,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[ADMIN] Error updating upload:", error);
    return NextResponse.json(
      { error: "Failed to update upload" },
      { status: 500 },
    );
  }
}
