import { prisma } from "@/lib/prisma";
import { promises as fs } from "fs";
import path from "path";
import bcrypt from "bcrypt";

export async function fetchAllData() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      createdAt: true,
    },
  });
  const uploads = await prisma.uploads.findMany({
    select: {
      id: true,
      link: true,
      state: true,
      uploaded_by: true,
      createdAt: true,
    },
  });

  return { uploads, users };
}

export function getContentType(): string {
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

export async function downloadFile(filename: string) {
  const filePath = path.join("uploads", filename);
  await fs.access(filePath);
  const fileBuffer = await fs.readFile(filePath);
  return fileBuffer;
}

export async function updateUpload(
  id: string,
  action: string,
  reason: string | undefined,
  adminUsername: string,
) {
  const upload = await prisma.uploads.findUnique({
    where: { id },
    select: { id: true, link: true, state: true },
  });

  if (!upload) {
    return null;
  }

  const newState = action === "accept" ? "ACCEPTED" : "REJECTED";

  const updatedUpload = await prisma.uploads.update({
    where: { id },
    data: {
      note: reason,
      state: newState,
      updatedAt: new Date(),
    },
  });

  console.log(
    `[ADMIN] Upload ${action}ed by ${adminUsername}:`,
    upload.link,
    reason ? `(Reason: ${reason})` : "",
  );

  return updatedUpload;
}

export async function updateUser(
  id: string,
  body: {
    username?: string;
    email?: string;
    name?: string;
    role?: string;
    password?: string;
  },
  sessionData: { user: { id: string; username: string } },
) {
  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true },
  });

  if (!existingUser) {
    return { notFound: true };
  }

  if (
    existingUser.role === "admin" &&
    existingUser.id !== sessionData.user.id
  ) {
    return { forbidden: true };
  }

  const { username, email, name, role, password } = body;

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
  if (role && role !== existingUser.role) {
    updateData.role = role;
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
      role: "viewer",
      isFirstLogin: true,
    },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  console.log(`[ADMIN] User created by ${adminUsername}:`, newUser.username);

  return { newUser };
}

export async function deleteUser(id: string, adminUsername: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true },
  });

  if (!user) {
    return { notFound: true };
  }

  if (user.role === "admin") {
    return { forbidden: true };
  }

  await prisma.user.delete({
    where: { id },
  });

  console.log(`[ADMIN] User deleted by ${adminUsername}:`, user.username);

  return { success: true };
}
