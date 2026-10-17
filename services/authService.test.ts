import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for sign-in and session handling (#112).
// Prisma and bcrypt are mocked: no database, no real hashing.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock("bcrypt", () => ({ default: { compare: vi.fn() } }));

import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getSession, logout, signIn } from "@/services/authService";

const NOW = new Date("2025-01-15T12:00:00Z");

const dbUser = {
  id: "u1",
  username: "alice",
  name: "Alice",
  role: "VIEWER",
  isActive: true,
  isFirstLogin: false,
  hashedPassword: "hash",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("signIn", () => {
  it("rejects an unknown user with 401", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    expect(await signIn("bob", "pw")).toEqual({
      success: false,
      status: 401,
      error: "Invalid credentials",
    });
  });

  it("rejects a wrong password with 401", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    expect(await signIn("alice", "wrong")).toMatchObject({
      success: false,
      status: 401,
    });
  });

  it("rejects an inactive user with 403 only after a valid password", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...dbUser,
      isActive: false,
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    expect(await signIn("alice", "pw")).toEqual({
      success: false,
      status: 403,
      error: "Account is inactive",
    });
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it("creates a 30-day session on success", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await signIn("alice", "pw");

    expect(bcrypt.compare).toHaveBeenCalledWith("pw", "hash");
    expect(result.success).toBe(true);
    expect(result.sessionToken).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expires).toEqual(new Date("2025-02-14T12:00:00Z"));
    expect(prisma.session.create).toHaveBeenCalledWith({
      data: {
        sessionToken: result.sessionToken,
        userId: "u1",
        expires: result.expires,
      },
    });
  });

  it("does not leak the password hash", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await signIn("alice", "pw");

    expect(result.user).toEqual({
      id: "u1",
      username: "alice",
      name: "Alice",
      role: "VIEWER",
      isActive: true,
      isFirstLogin: false,
    });
  });
});

describe("logout", () => {
  it("deletes the session by token", async () => {
    await logout("abc");
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { sessionToken: "abc" },
    });
  });
});

describe("getSession", () => {
  const session = {
    sessionToken: "abc",
    expires: new Date("2025-02-01T00:00:00Z"),
    user: { ...dbUser, hashedPassword: undefined },
  };

  it("is invalid for an unknown token", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);
    expect(await getSession("abc")).toEqual({
      valid: false,
      expired: false,
      session: null,
    });
  });

  it("deletes the session of an inactive user", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...session,
      user: { ...session.user, isActive: false },
    } as any);
    expect(await getSession("abc")).toEqual({
      valid: false,
      expired: false,
      session: null,
    });
    expect(prisma.session.delete).toHaveBeenCalledWith({
      where: { sessionToken: "abc" },
    });
  });

  it("deletes and flags an expired session", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...session,
      expires: new Date("2025-01-01T00:00:00Z"),
    } as any);
    expect(await getSession("abc")).toEqual({
      valid: false,
      expired: true,
      session: null,
    });
    expect(prisma.session.delete).toHaveBeenCalled();
  });

  it("returns a valid session", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(session as any);
    expect(await getSession("abc")).toEqual({
      valid: true,
      expired: false,
      session,
    });
    expect(prisma.session.delete).not.toHaveBeenCalled();
  });
});
