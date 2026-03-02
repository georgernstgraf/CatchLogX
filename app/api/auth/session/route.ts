import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/services/authService";

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("session-token")?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { authenticated: false, error: "No session token found" },
        { status: 401 },
      );
    }

    const { valid, expired, session } = await getSession(sessionToken);

    if (!valid && expired) {
      const response = NextResponse.json(
        { authenticated: false, error: "Session expired" },
        { status: 401 },
      );

      response.cookies.set("session-token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: new Date(0),
        path: "/",
      });

      return response;
    }

    if (!valid || !session) {
      return NextResponse.json(
        { authenticated: false, error: "Invalid session token" },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        user: session.user,
        id: session.userId,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Session validation error:", error);
    return NextResponse.json(
      { authenticated: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
