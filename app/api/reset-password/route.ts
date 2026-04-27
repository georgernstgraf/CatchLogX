import { NextRequest, NextResponse } from "next/server";
import { validateResetToken, changePassword } from "@/services/passwordService";

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

  const resetRequest = await validateResetToken(token);

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
    try {
      await changePassword(username, newPassword, token);
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
