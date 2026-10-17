import { prisma } from "../lib/prisma";
import bcrypt from "bcrypt";

type DevUser = {
  username: string;
  password: string;
  email: string;
  role: "SUPER_ADMIN" | "VIEWER";
};

/**
 * Dev-only users. Idempotent: re-running keeps the dataset stable and resets
 * the passwords to the dev defaults (never use these credentials in prod).
 */
const DEV_USERS: DevUser[] = [
  {
    username: "admin",
    password: "admin",
    email: "admin@testmail.com",
    role: "SUPER_ADMIN",
  },
  {
    username: "user1",
    password: "user1",
    email: "user1@testmail.com",
    role: "VIEWER",
  },
];

export async function seedDevUsers() {
  for (const user of DEV_USERS) {
    const hashedPassword = await bcrypt.hash(user.password, 10);

    await prisma.user.upsert({
      where: { username: user.username },
      update: {
        hashedPassword,
        email: user.email,
        role: user.role,
        isFirstLogin: false,
      },
      create: {
        username: user.username,
        hashedPassword,
        email: user.email,
        role: user.role,
        isFirstLogin: false,
      },
    });
  }

  console.log(`✅ Insert/Update completed for ${DEV_USERS.length} users.`);
}

async function main() {
  await seedDevUsers();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
