import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // For now, we'll let the API routes handle their own authentication
  // since Prisma can't run in the Edge Runtime environment
  
  // We can add basic checks here like checking for session-token cookie existence
  if (request.nextUrl.pathname.startsWith("/api/admin/")) {
    const sessionToken = request.cookies.get("session-token")?.value;
    
    if (!sessionToken) {
      return NextResponse.json(
        { error: "Authentication required - no session token" },
        { status: 401 }
      );
    }
    
    // Let the API routes handle detailed validation with Prisma
  }

  return NextResponse.next();
}

// Configure which paths this middleware should run on
export const config = {
  matcher: [
    "/api/admin/:path*"
  ],
};