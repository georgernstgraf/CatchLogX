import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";

export async function signIn(username: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user) {
    return { success: false, status: 401, error: "Invalid credentials" };
  }

  const isValid = await bcrypt.compare(password, user.hashedPassword);
  if (!isValid) {
    return { success: false, status: 401, error: "Invalid credentials" };
  }

  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);

  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires,
    },
  });

  return {
    success: true,
    sessionToken,
    expires,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      isFirstLogin: user.isFirstLogin,
    },
  };
}

export async function logout(sessionToken: string) {
  await prisma.session.deleteMany({
    where: { sessionToken },
  });
}

export async function getSession(sessionToken: string) {
  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          role: true,
          isFirstLogin: true,
        },
      },
    },
  });

  if (!session) {
    return { valid: false, expired: false, session: null };
  }

  if (session.expires < new Date()) {
    await prisma.session.delete({
      where: { sessionToken },
    });
    return { valid: false, expired: true, session: null };
  }

  return { valid: true, expired: false, session };
}
