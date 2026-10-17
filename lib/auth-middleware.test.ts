import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the API auth guard (#112).
// Session lookup is mocked: no database is touched.
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));

import { requireAuth, withAuth } from "@/lib/auth-middleware";
import { getSessionUser, SessionData } from "@/lib/session";

const sessionData: SessionData = {
  user: {
    id: "u1",
    username: "alice",
    name: null,
    role: "VIEWER",
    isActive: true,
  },
  sessionToken: "abc",
  expires: new Date("2099-01-01"),
};

const request = new NextRequest("http://localhost/api/test");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAuth", () => {
  it("returns 401 without a session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const result = await requireAuth(request);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns the session data when authenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionData);
    expect(await requireAuth(request)).toBe(sessionData);
  });
});

describe("withAuth", () => {
  it("does not call the handler without a session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const handler = vi.fn();
    const response = await withAuth(handler)(request);
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes request, session and extra args to the handler", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionData);
    const ok = NextResponse.json({ ok: true });
    const handler = vi.fn().mockResolvedValue(ok);
    const context = { params: { id: "1" } };

    const response = await withAuth(handler)(request, context);

    expect(response).toBe(ok);
    expect(handler).toHaveBeenCalledWith(request, sessionData, context);
  });
});
