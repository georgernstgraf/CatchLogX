import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, SessionData } from "@/lib/session";

/**
 * Middleware to protect API routes that require admin authentication
 * Usage: Import this function and call it at the beginning of your admin API route handlers
 */
export async function requireAdminAuth(
  request: NextRequest
): Promise<SessionData | NextResponse> {
  const sessionData = await getSessionUser(request);

  if (!sessionData) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // Check if user has admin role
  if (sessionData.user.role !== "admin") {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  return sessionData;
}

/**
 * Higher-order function to wrap admin API route handlers with authentication
 * Usage: export const GET = withAdminAuth(async (request, sessionData) => { ... });
 */
export function withAdminAuth<T extends unknown[]>(
  handler: (
    request: NextRequest,
    sessionData: SessionData,
    ...args: T
  ) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T) => {
    const authResult = await requireAdminAuth(request);

    if (authResult instanceof NextResponse) {
      // If requireAdminAuth returned a response (error), return it
      return authResult;
    }

    // Call the original handler with session data
    return handler(request, authResult, ...args);
  };
}
