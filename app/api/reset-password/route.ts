import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";

export async function GET(req: NextRequest) {
  const token = await req?.nextUrl?.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      {
        message: "Token is required.",
        timestamp: new Date(),
      },
      {
        status: 400,
      },
    );
  }

  const resetRequest = await prisma.passwordResets.findFirst({
    where: {
      token: token,
      state: "REQUESTED",
      timestamp: {
        gte: new Date(Date.now() - 1000 * 60 * 15),
      },
    },
  });

  if (!resetRequest) {
    return NextResponse.json(
      {
        message: "Token is invalid, already used or has expired.",
        timestamp: new Date(),
      },
      {
        status: 400,
      },
    );
  }

  await prisma.passwordResets.update({
    where: {
      id: resetRequest.id,
    },
    data: {
      state: "EXPIRED",
    },
  });

  return NextResponse.json(
    {
      valid: true,
      username: resetRequest.username,
      token: resetRequest.token,
      timestamp: new Date(),
    },
    {
      status: 200,
    },
  );
}

export async function POST(req: NextRequest) {
  const { newPassword, newPasswordConfirm, username, token, isValid } =
    await req.json();

  if (newPassword !== newPasswordConfirm) {
    return NextResponse.json(
      {
        message: "The entered passwords are not matching.",
        timestamp: new Date(),
      },
      {
        status: 400,
      },
    );
  }

  if (!isValid) {
    return NextResponse.json(
      {
        message: "The entered token is invalid.",
        timestamp: new Date(),
      },
      {
        status: 400,
      },
    );
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    try {
      await prisma.user.update({
        where: {
          username: username,
        },
        data: {
          hashedPassword: hashedPassword,
        },
      });
    } catch {
      return NextResponse.json(
        {
          message: "Error while trying to set new password.",
          timestamp: new Date(),
        },
        {
          status: 500,
        },
      );
    }

    await prisma.passwordResets.update({
      where: {
        token: token,
      },
      data: {
        state: "DONE",
        passwordChangedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        message: "Password changed successfully.",
        timestamp: new Date(),
      },
      {
        status: 200,
      },
    );
  } catch (e) {
    console.log(e);
    return NextResponse.json(
      {
        message:
          "There was an error while changing your password. Please try again.",
        timestamp: new Date(),
      },
      {
        status: 500,
      },
    );
  }
}
