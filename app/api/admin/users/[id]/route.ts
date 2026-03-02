import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { updateUser, deleteUser } from "@/services/adminService";

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

    const result = await updateUser(id, body, sessionData);

    if (result.notFound) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (result.forbidden) {
      return NextResponse.json(
        { error: "Cannot edit other admin users" },
        { status: 403 },
      );
    }

    if (result.conflict) {
      return NextResponse.json(
        { error: "Username or email already exists" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        message: "User updated successfully",
        user: result.updatedUser,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[ADMIN] Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
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
  const sessionData = authResult;

  try {
    const { id } = await context.params;

    const result = await deleteUser(id, sessionData.user.username);

    if (result.notFound) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (result.forbidden) {
      return NextResponse.json(
        { error: "Cannot delete admin users" },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { message: "User deleted successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("[ADMIN] Error deleting user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 },
    );
  }
}
