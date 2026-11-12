import { NextRequest, NextResponse } from "next/server";
import { handleForgotPassword } from "@/services/passwordService";

// Thin adapter: the decision logic lives in handleForgotPassword (#194) so it
// can be unit-tested without jsdom.
export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => ({}));
  const { status, body } = await handleForgotPassword(payload?.username);

  return NextResponse.json({ ...body, timestamp: new Date() }, { status });
}
