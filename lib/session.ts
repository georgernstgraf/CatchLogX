import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { UserRoles } from "@/app/generated/prisma";

export interface SessionUser {
  id: string;
  username: string;
  name: string | null;
  role: UserRoles;
  isActive: boolean;
}

export interface SessionData {
  user: SessionUser;
  sessionToken: string;
  expires: Date;
}

/**
 * Get the current user from the session token in the request
 * @param request - The NextRequest object
 * @returns Promise<SessionData | null> - The session data if valid, null otherwise
 */
export async function getSessionUser(
  request: NextRequest,
): Promise<SessionData | null> {
  try {
    // Get session token from cookie
    const sessionToken = request.cookies.get("session-token")?.value;

    if (!sessionToken) {
      return null;
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
            isActive: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    if (!session.user.isActive) {
      await prisma.session.delete({
        where: { sessionToken },
      });
      return null;
    }

    // Check if session is expired
    if (session.expires < new Date()) {
      // Clean up expired session
      await prisma.session.delete({
        where: { sessionToken },
      });
      return null;
    }

    return {
      user: session.user,
      sessionToken: session.sessionToken,
      expires: session.expires,
    };
  } catch (error) {
    console.error("Error getting session user:", error);
    return null;
  }
}

/**
 * Check if a request has a valid session
 * @param request - The NextRequest object
 * @returns Promise<boolean> - True if the session is valid, false otherwise
 */
export async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const sessionData = await getSessionUser(request);
  return sessionData !== null;
}

/**
 * Clean up expired sessions from the database
 * This should be called periodically to keep the database clean
 */
export async function cleanupExpiredSessions(): Promise<void> {
  try {
    await prisma.session.deleteMany({
      where: {
        expires: {
          lt: new Date(),
        },
      },
    });
  } catch (error) {
    console.error("Error cleaning up expired sessions:", error);
  }
}
