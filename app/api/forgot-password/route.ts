import { NextRequest, NextResponse } from "next/server";
import { findUserOrThrow, initiatePasswordReset } from "@/services/passwordService";

export async function POST(req: NextRequest) {
  const { username, timestamp } = await req.json();

  if (username === "" || username === null) {
    return NextResponse.json(
      {
        message: "Username must not be empty.",
        timestamp: new Date(),
      },
      {
        status: 400,
      },
    );
  }

  const { exists, error, error_message, data } =
    await findUserOrThrow(username);

  if (!exists || data === null) {
    return NextResponse.json(
      {
        message: error_message,
        timestamp: new Date(),
      },
      { status: error },
    );
  }

  try {
    if (exists && data !== null) {
      await initiatePasswordReset(username, timestamp, data.email);
    }
  } catch (e) {
    return NextResponse.json(
      {
        message:
          "There was an issue while initiating your password reset. Please try again later.",
        error_message: e,
        timestamp: new Date(),
      },
      { status: 500 },
    );
  }
  return NextResponse.json(
    {
      message:
        "Password Reset successfully initiated. Please check your emails.",
      timestamp: new Date(),
    },
    { status: 200 },
  );
}
