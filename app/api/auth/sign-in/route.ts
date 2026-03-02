import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/services/authService";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 },
      );
    }

    const result = await signIn(username, password);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    const response = NextResponse.json(
      {
        success: true,
        user: result.user,
      },
      { status: 200 },
    );

    response.cookies.set("session-token", result.sessionToken!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: result.expires,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Sign-in error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
