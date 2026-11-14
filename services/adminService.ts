import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { UserRoles } from "@/app/generated/prisma";
import { listImports } from "@/services/importService";

const adminRoles = new Set<UserRoles>(["ADMIN", "SUPER_ADMIN"]);

/**
 * Everything the admin panel needs in one call: users plus the import list.
 *
 * The import itself (write path, delete, download) lives in
 * services/importService.ts since #202 — the admin review step is gone, an
 * upload imports directly.
 */
export async function fetchAllData() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  const imports = await listImports();

  return { imports, users };
}

export async function updateUser(
  id: string,
  body: {
    username?: string;
    email?: string;
    name?: string;
    role?: UserRoles;
    isActive?: boolean;
    password?: string;
  },
  sessionData: {
    user: { id: string; username: string; role: UserRoles; isActive: boolean };
  },
) {
  if (!sessionData.user.isActive) {
    return { forbidden: true, reason: "Inactive users cannot manage accounts" };
  }

  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true, isActive: true },
  });

  if (!existingUser) {
    return { notFound: true };
  }

  const actorRole = sessionData.user.role;
  const actorId = sessionData.user.id;
  const isSuperAdmin = actorRole === "SUPER_ADMIN";
  const isSelfEdit = existingUser.id === actorId;

  if (!isSuperAdmin) {
    if (!adminRoles.has(actorRole)) {
      return { forbidden: true, reason: "Admin access required" };
    }

    // ADMIN may only manage VIEWER users, plus own account details.
    if (!isSelfEdit && existingUser.role !== "VIEWER") {
      return {
        forbidden: true,
        reason: "Admins can only edit viewer accounts",
      };
    }

    if (body.role && body.role !== existingUser.role) {
      return {
        forbidden: true,
        reason: "Only super admins can change user roles",
      };
    }

    if (
      typeof body.isActive === "boolean" &&
      body.isActive !== existingUser.isActive
    ) {
      return {
        forbidden: true,
        reason: "Only super admins can change activation state",
      };
    }
  }

  const { username, email, name, role, isActive, password } = body;

  if (username || email) {
    const conflictUser = await prisma.user.findFirst({
      where: {
        AND: [
          { id: { not: id } },
          {
            OR: [
              ...(username ? [{ username }] : []),
              ...(email ? [{ email }] : []),
            ],
          },
        ],
      },
    });

    if (conflictUser) {
      return { conflict: true };
    }
  }

  const updateData: any = {};
  if (username) updateData.username = username;
  if (email) updateData.email = email;
  if (name !== undefined) updateData.name = name;

  // Prevent removing/deactivating the final active SUPER_ADMIN.
  if (existingUser.role === "SUPER_ADMIN") {
    const activeSuperAdminCount = await prisma.user.count({
      where: { role: "SUPER_ADMIN", isActive: true },
    });

    const roleWouldChangeAwayFromSuperAdmin = role && role !== "SUPER_ADMIN";
    const activeWouldBeDisabled = isActive === false;

    if (
      existingUser.isActive &&
      activeSuperAdminCount <= 1 &&
      (roleWouldChangeAwayFromSuperAdmin || activeWouldBeDisabled)
    ) {
      return {
        forbidden: true,
        reason: "Cannot demote or deactivate the last active super admin",
      };
    }
  }

  if (role && role !== existingUser.role) {
    updateData.role = role;
  }
  if (typeof isActive === "boolean") {
    updateData.isActive = isActive;
  }
  if (password) {
    updateData.hashedPassword = await bcrypt.hash(password, 10);
    updateData.isFirstLogin = true;
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  console.log(
    `[ADMIN] User updated by ${sessionData.user.username}:`,
    updatedUser.username,
  );

  return { updatedUser };
}

export async function createUser(
  body: {
    username: string;
    email: string;
    name?: string;
    password: string;
  },
  adminUsername: string,
) {
  const { username, email, name, password } = body;

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ username: username }, { email: email }],
    },
  });

  if (existingUser) {
    return { conflict: true };
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await prisma.user.create({
    data: {
      username,
      email,
      name,
      hashedPassword,
      role: "VIEWER",
      isActive: true,
      isFirstLogin: true,
    },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  console.log(`[ADMIN] User created by ${adminUsername}:`, newUser.username);

  return { newUser };
}

export async function deleteUser(
  id: string,
  sessionData: {
    user: { id: string; username: string; role: UserRoles; isActive: boolean };
  },
) {
  if (!sessionData.user.isActive) {
    return { forbidden: true, reason: "Inactive users cannot delete accounts" };
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true, isActive: true },
  });

  if (!user) {
    return { notFound: true };
  }

  const actorRole = sessionData.user.role;
  const isSuperAdmin = actorRole === "SUPER_ADMIN";

  // Checked here too, not only by withAdminAuth, and before the inactive-target bypass (#117).
  if (!isSuperAdmin && !adminRoles.has(actorRole)) {
    return { forbidden: true, reason: "Admin access required" };
  }

  // Existing no-delete restrictions are bypassed for inactive target accounts.
  if (user.isActive) {
    if (!isSuperAdmin && user.role !== "VIEWER") {
      return {
        forbidden: true,
        reason: "Admins can only delete active viewer accounts",
      };
    }

    if (user.role === "SUPER_ADMIN") {
      const activeSuperAdminCount = await prisma.user.count({
        where: { role: "SUPER_ADMIN", isActive: true },
      });

      if (activeSuperAdminCount <= 1) {
        return {
          forbidden: true,
          reason: "Cannot delete the last active super admin",
        };
      }
    }
  }

  await prisma.user.delete({
    where: { id },
  });

  console.log(
    `[ADMIN] User deleted by ${sessionData.user.username}:`,
    user.username,
  );

  return { success: true };
}
