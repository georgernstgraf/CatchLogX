import { NextRequest, NextResponse } from "next/server";
import { processUpload } from "@/services/uploadService";

export async function POST(req: NextRequest) {
  try {
    const fileBuffer = Buffer.from(await req.arrayBuffer());
    const cookieHeader = req.headers.get("cookie") || "";

    const result = await processUpload(fileBuffer, cookieHeader);

    if (!result.success) {
      if ("validationErrors" in result) {
        return NextResponse.json(
          {
            error: result.error,
            validationErrors: result.validationErrors,
          },
          { status: result.status },
        );
      }
      if ("details" in result && result.details) {
        return NextResponse.json(
          {
            error: result.error,
            details: result.details,
          },
          { status: result.status },
        );
      }
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({
      message: "Upload erfolgreich",
      data: result.data,
      summary: result.summary,
    });
  } catch (err: any) {
    console.error("Serverfehler:", err);
    return NextResponse.json(
      { error: "Serverfehler", details: err.message },
      { status: 500 },
    );
  }
}
