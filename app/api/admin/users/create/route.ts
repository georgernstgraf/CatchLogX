import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { createUser } from "@/services/adminService";

export async function POST(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const sessionData = authResult;

  try {
    const body = await request.json();
    const { username, email, password } = body;

    if (!username || !email || !password) {
      return NextResponse.json(
        { error: "Username, email, and password are required" },
        { status: 400 },
      );
    }

    const result = await createUser(body, sessionData.user.username);

    if (result.conflict) {
      return NextResponse.json(
        { error: "User with this username or email already exists" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        message: "User created successfully",
        user: result.newUser,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[ADMIN] Error creating user:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 },
    );
  }
}
