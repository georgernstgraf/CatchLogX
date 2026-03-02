import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  if (!query || query === null || query === "") {
    return NextResponse.json(
      {
        message: "The query must not be empty.",
        timestamp: new Date(),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({});
}
