import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the admin service (#112): user management permissions.
// The import side (write path, delete, download, list) lives in
// services/importService.test.ts since #202.
// Prisma and bcrypt are mocked — this file is the template for testing
// I/O-bound services without real infrastructure.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("@/services/importService", () => ({
  listImports: vi.fn(),
}));
vi.mock("bcrypt", () => ({
  default: { hash: vi.fn(async (pw: string) => `hashed:${pw}`) },
}));

import { prisma } from "@/lib/prisma";
import { listImports } from "@/services/importService";
import {
  createUser,
  deleteUser,
  fetchAllData,
  updateUser,
} from "@/services/adminService";

type Role = "VIEWER" | "ADMIN" | "SUPER_ADMIN";

function actor(role: Role, isActive = true, id = "actor") {
  return { user: { id, username: "actor", role, isActive } };
}

function target(role: Role, isActive = true, id = "target") {
  return { id, username: "target", role, isActive };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
  vi.mocked(prisma.user.update).mockImplementation((async ({ data }: any) => ({
    id: "target",
    username: "target",
    ...data,
  })) as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- aggregate for the admin panel ------------------------------------------

describe("fetchAllData", () => {
  it("returns users and the import list, never password hashes", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u1", username: "u1", email: "u1@x.at", name: null, role: "VIEWER", isActive: true, createdAt: new Date() },
    ] as any);
    vi.mocked(listImports).mockResolvedValue([
      { id: "imp-1", fileName: "a.xlsx" },
    ] as any);

    const result = await fetchAllData();

    expect(result.users).toHaveLength(1);
    expect(result.imports).toEqual([{ id: "imp-1", fileName: "a.xlsx" }]);
    expect(listImports).toHaveBeenCalledOnce();

    const select = vi.mocked(prisma.user.findMany).mock.calls[0][0]!.select!;
    expect(select).not.toHaveProperty("hashedPassword");
  });
});

// --- user management --------------------------------------------------------

describe("updateUser", () => {
  function givenTarget(user: ReturnType<typeof target> | null) {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
  }

  it("forbids inactive actors without touching the DB", async () => {
    expect(await updateUser("target", {}, actor("SUPER_ADMIN", false))).toEqual(
      { forbidden: true, reason: "Inactive users cannot manage accounts" },
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns notFound for an unknown user", async () => {
    givenTarget(null);
    expect(await updateUser("x", {}, actor("ADMIN"))).toEqual({
      notFound: true,
    });
  });

  it.each<[string, Role, ReturnType<typeof target>, object, string]>([
    ["a viewer", "VIEWER", target("VIEWER"), {}, "Admin access required"],
    [
      "an admin editing another admin",
      "ADMIN",
      target("ADMIN"),
      {},
      "Admins can only edit viewer accounts",
    ],
    [
      "an admin editing a super admin",
      "ADMIN",
      target("SUPER_ADMIN"),
      {},
      "Admins can only edit viewer accounts",
    ],
    [
      "an admin changing a role",
      "ADMIN",
      target("VIEWER"),
      { role: "ADMIN" },
      "Only super admins can change user roles",
    ],
    [
      "an admin changing activation",
      "ADMIN",
      target("VIEWER"),
      { isActive: false },
      "Only super admins can change activation state",
    ],
  ])("forbids %s", async (_label, role, existing, body, reason) => {
    givenTarget(existing);
    expect(await updateUser("target", body, actor(role))).toEqual({
      forbidden: true,
      reason,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("lets an admin edit a viewer", async () => {
    givenTarget(target("VIEWER"));
    const result = await updateUser(
      "target",
      { name: "New", role: "VIEWER", isActive: true },
      actor("ADMIN"),
    );
    expect(result).toHaveProperty("updatedUser");
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toEqual({
      name: "New",
      isActive: true,
    });
  });

  it("lets an admin edit their own account", async () => {
    givenTarget(target("ADMIN", true, "actor"));
    const result = await updateUser("actor", { name: "Me" }, actor("ADMIN"));
    expect(result).toHaveProperty("updatedUser");
  });

  it("reports a username/e-mail conflict", async () => {
    givenTarget(target("VIEWER"));
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "other" } as any);

    expect(
      await updateUser("target", { username: "taken" }, actor("SUPER_ADMIN")),
    ).toEqual({ conflict: true });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ id: { not: "target" } }, { OR: [{ username: "taken" }] }] },
    });
  });

  it("skips the conflict check when neither username nor e-mail change", async () => {
    givenTarget(target("VIEWER"));
    await updateUser("target", { name: "x" }, actor("SUPER_ADMIN"));
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it.each([{ role: "ADMIN" as const }, { isActive: false }])(
    "protects the last active super admin (%o)",
    async (body) => {
      givenTarget(target("SUPER_ADMIN"));
      vi.mocked(prisma.user.count).mockResolvedValue(1);
      expect(await updateUser("target", body, actor("SUPER_ADMIN"))).toEqual({
        forbidden: true,
        reason: "Cannot demote or deactivate the last active super admin",
      });
    },
  );

  it("allows demoting a super admin when another one is active", async () => {
    givenTarget(target("SUPER_ADMIN"));
    vi.mocked(prisma.user.count).mockResolvedValue(2);
    await updateUser("target", { role: "ADMIN" }, actor("SUPER_ADMIN"));
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toEqual({
      role: "ADMIN",
    });
  });

  it("hashes a new password and forces a password change", async () => {
    givenTarget(target("VIEWER"));
    await updateUser("target", { password: "pw" }, actor("SUPER_ADMIN"));
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toEqual({
      hashedPassword: "hashed:pw",
      isFirstLogin: true,
    });
  });

  it("allows clearing the display name", async () => {
    givenTarget(target("VIEWER"));
    await updateUser("target", { name: "" }, actor("SUPER_ADMIN"));
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toEqual({
      name: "",
    });
  });
});

describe("createUser", () => {
  const body = {
    username: "bob",
    email: "bob@x.at",
    name: "Bob",
    password: "pw",
  };

  it("reports a conflict for an existing username or e-mail", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u1" } as any);
    expect(await createUser(body, "admin")).toEqual({ conflict: true });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("creates an active viewer that must change the password", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "u2" } as any);

    expect(await createUser(body, "admin")).toEqual({ newUser: { id: "u2" } });
    expect(vi.mocked(prisma.user.create).mock.calls[0][0].data).toEqual({
      username: "bob",
      email: "bob@x.at",
      name: "Bob",
      hashedPassword: "hashed:pw",
      role: "VIEWER",
      isActive: true,
      isFirstLogin: true,
    });
  });
});

describe("deleteUser", () => {
  function givenTarget(user: ReturnType<typeof target> | null) {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
  }

  it("forbids inactive actors", async () => {
    expect(await deleteUser("target", actor("SUPER_ADMIN", false))).toEqual({
      forbidden: true,
      reason: "Inactive users cannot delete accounts",
    });
  });

  it("returns notFound for an unknown user", async () => {
    givenTarget(null);
    expect(await deleteUser("x", actor("ADMIN"))).toEqual({ notFound: true });
  });

  it.each([target("VIEWER"), target("ADMIN", false)])(
    "forbids viewers deleting anyone (%o) (#117)",
    async (existing) => {
      givenTarget(existing);
      expect(await deleteUser("target", actor("VIEWER"))).toEqual({
        forbidden: true,
        reason: "Admin access required",
      });
      expect(prisma.user.delete).not.toHaveBeenCalled();
    },
  );

  it("forbids admins deleting active non-viewers", async () => {
    givenTarget(target("ADMIN"));
    expect(await deleteUser("target", actor("ADMIN"))).toEqual({
      forbidden: true,
      reason: "Admins can only delete active viewer accounts",
    });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("lets admins delete inactive accounts of any role", async () => {
    givenTarget(target("ADMIN", false));
    expect(await deleteUser("target", actor("ADMIN"))).toEqual({
      success: true,
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "target" } });
  });

  it("protects the last active super admin", async () => {
    givenTarget(target("SUPER_ADMIN"));
    vi.mocked(prisma.user.count).mockResolvedValue(1);
    expect(await deleteUser("target", actor("SUPER_ADMIN"))).toEqual({
      forbidden: true,
      reason: "Cannot delete the last active super admin",
    });
  });

  it("lets a super admin delete another super admin", async () => {
    givenTarget(target("SUPER_ADMIN"));
    vi.mocked(prisma.user.count).mockResolvedValue(2);
    expect(await deleteUser("target", actor("SUPER_ADMIN"))).toEqual({
      success: true,
    });
  });

  it("lets an admin delete a viewer", async () => {
    givenTarget(target("VIEWER"));
    expect(await deleteUser("target", actor("ADMIN"))).toEqual({
      success: true,
    });
  });
});

