import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for server-side session validation (#112).
// Prisma is mocked: no database is touched.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  cleanupExpiredSessions,
  getSessionUser,
  isAuthenticated,
} from "@/lib/session";

const NOW = new Date("2025-01-15T12:00:00Z");

const activeUser = {
  id: "u1",
  username: "alice",
  name: "Alice",
  role: "VIEWER",
  isActive: true,
};

function requestWithToken(token?: string) {
  return new NextRequest("http://localhost/api/test", {
    headers: token ? { cookie: `session-token=${token}` } : {},
  });
}

function mockSession(overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.session.findUnique).mockResolvedValue({
    sessionToken: "abc",
    expires: new Date("2025-02-01T00:00:00Z"),
    user: activeUser,
    ...overrides,
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getSessionUser", () => {
  it("returns null without a cookie and skips the DB", async () => {
    expect(await getSessionUser(requestWithToken())).toBeNull();
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for an unknown token", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);
    expect(await getSessionUser(requestWithToken("abc"))).toBeNull();
  });

  it("deletes the session of an inactive user", async () => {
    mockSession({ user: { ...activeUser, isActive: false } });
    expect(await getSessionUser(requestWithToken("abc"))).toBeNull();
    expect(prisma.session.delete).toHaveBeenCalledWith({
      where: { sessionToken: "abc" },
    });
  });

  it("deletes an expired session", async () => {
    mockSession({ expires: new Date("2025-01-01T00:00:00Z") });
    expect(await getSessionUser(requestWithToken("abc"))).toBeNull();
    expect(prisma.session.delete).toHaveBeenCalledWith({
      where: { sessionToken: "abc" },
    });
  });

  it("returns the session data for a valid session", async () => {
    mockSession();
    expect(await getSessionUser(requestWithToken("abc"))).toEqual({
      user: activeUser,
      sessionToken: "abc",
      expires: new Date("2025-02-01T00:00:00Z"),
    });
    expect(prisma.session.delete).not.toHaveBeenCalled();
  });

  it("returns null when the DB throws", async () => {
    vi.mocked(prisma.session.findUnique).mockRejectedValue(new Error("down"));
    expect(await getSessionUser(requestWithToken("abc"))).toBeNull();
  });
});

describe("isAuthenticated", () => {
  it("is true for a valid session", async () => {
    mockSession();
    expect(await isAuthenticated(requestWithToken("abc"))).toBe(true);
  });

  it("is false without a session", async () => {
    expect(await isAuthenticated(requestWithToken())).toBe(false);
  });
});

describe("cleanupExpiredSessions", () => {
  it("deletes sessions that expired before now", async () => {
    await cleanupExpiredSessions();
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { expires: { lt: NOW } },
    });
  });

  it("swallows DB errors", async () => {
    vi.mocked(prisma.session.deleteMany).mockRejectedValue(new Error("down"));
    await expect(cleanupExpiredSessions()).resolves.toBeUndefined();
  });
});
