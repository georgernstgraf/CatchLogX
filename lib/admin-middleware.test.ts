import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the admin API guard (#112).
// Session lookup is mocked: no database is touched.
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));

import { requireAdminAuth, withAdminAuth } from "@/lib/admin-middleware";
import { getSessionUser, SessionData } from "@/lib/session";

function session(
  role: SessionData["user"]["role"],
  isActive = true,
): SessionData {
  return {
    user: { id: "u1", username: "alice", name: null, role, isActive },
    sessionToken: "abc",
    expires: new Date("2099-01-01"),
  };
}

const request = new NextRequest("http://localhost/api/admin/test");

async function errorOf(result: unknown) {
  expect(result).toBeInstanceOf(NextResponse);
  const response = result as NextResponse;
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAdminAuth", () => {
  it("returns 401 without a session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect(await errorOf(await requireAdminAuth(request))).toEqual({
      status: 401,
      body: { error: "Authentication required" },
    });
  });

  it("returns 403 for an inactive admin", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(session("ADMIN", false));
    expect(await errorOf(await requireAdminAuth(request))).toEqual({
      status: 403,
      body: { error: "Account is inactive" },
    });
  });

  it("returns 403 for a viewer", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(session("VIEWER"));
    expect(await errorOf(await requireAdminAuth(request))).toEqual({
      status: 403,
      body: { error: "Admin access required" },
    });
  });

  it.each(["ADMIN", "SUPER_ADMIN"] as const)(
    "returns the session for %s",
    async (role) => {
      const data = session(role);
      vi.mocked(getSessionUser).mockResolvedValue(data);
      expect(await requireAdminAuth(request)).toBe(data);
    },
  );
});

describe("withAdminAuth", () => {
  it("does not call the handler for a viewer", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(session("VIEWER"));
    const handler = vi.fn();
    const response = await withAdminAuth(handler)(request);
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes request, session and extra args to the handler", async () => {
    const data = session("ADMIN");
    vi.mocked(getSessionUser).mockResolvedValue(data);
    const ok = NextResponse.json({ ok: true });
    const handler = vi.fn().mockResolvedValue(ok);
    const context = { params: { id: "1" } };

    expect(await withAdminAuth(handler)(request, context)).toBe(ok);
    expect(handler).toHaveBeenCalledWith(request, data, context);
  });
});
