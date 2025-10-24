import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // Get session token from cookie
    const sessionToken = request.cookies.get("session-token")?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { authenticated: false, error: "No session token found" },
        { status: 401 }
      );
    }

    // Find session in database
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            role: true,
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { authenticated: false, error: "Invalid session token" },
        { status: 401 }
      );
    }

    // Check if session is expired
    if (session.expires < new Date()) {
      // Clean up expired session
      await prisma.session.delete({
        where: { sessionToken },
      });

      const response = NextResponse.json(
        { authenticated: false, error: "Session expired" },
        { status: 401 }
      );

      // Clear expired session cookie
      response.cookies.set("session-token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: new Date(0),
        path: "/",
      });

      return response;
    }

    // Return user data if session is valid
    return NextResponse.json(
      {
        authenticated: true,
        user: session.user,
        id: session.userId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Session validation error:", error);
    return NextResponse.json(
      { authenticated: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
