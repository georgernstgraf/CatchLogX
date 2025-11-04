import { prisma } from "../lib/prisma";
import bcrypt from "bcrypt";

async function main() {
  const username = "admin";
  const plainPassword = "admin";
  const email = "admin@testmail.com";
  const hashed = await bcrypt.hash(plainPassword, 10);

  await prisma.user.create({
    data: {
      username: username,
      hashedPassword: hashed,
      email: email,
      role: "admin",
      isFirstLogin: false,
    },
  });

  await prisma.user.create({
    data: {
      username: "user1",
      hashedPassword: await bcrypt.hash("user1", 10),
      email: "user1@testmail.com",
      role: "viewer",
      isFirstLogin: false,
    },
  });

  console.log("Users created");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
