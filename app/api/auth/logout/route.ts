import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    // Get session token from cookie
    const sessionToken = request.cookies.get("session-token")?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: "No active session found" },
        { status: 401 }
      );
    }

    // Remove session from database
    await prisma.session.deleteMany({
      where: { sessionToken },
    });

    // Create response
    const response = NextResponse.json(
      { success: true, message: "Logged out successfully" },
      { status: 200 }
    );

    // Clear session cookie
    response.cookies.set("session-token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: new Date(0), // Expire immediately
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Allow GET method for logout as well (for convenience)
  return POST(request);
}
