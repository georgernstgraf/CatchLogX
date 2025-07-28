import { prisma } from "../lib/prisma";
import bcrypt from "bcrypt";

async function main() {
  const username = "admin";
  const plainPassword = "admin";
  const hashed = await bcrypt.hash(plainPassword, 10);

  await prisma.user.create({
    data: {
      username,
      hashedPassword: hashed,
    },
  });

  console.log("User created");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
