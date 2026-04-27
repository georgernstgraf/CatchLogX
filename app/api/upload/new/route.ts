import { NextRequest, NextResponse } from "next/server";
import { processUpload } from "@/services/uploadService";
import { requireAuth } from "@/lib/auth-middleware";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const fileBuffer = Buffer.from(await req.arrayBuffer());

    const result = await processUpload(fileBuffer, authResult.user.id);

    if (!result.success) {
      if (
        "excelError" in result &&
        result.excelError &&
        "fileBuffer" in result
      ) {
        return new NextResponse(result.fileBuffer, {
          status: 400,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition":
              'attachment; filename="validation_errors.xlsx"',
          },
        });
      }

      return NextResponse.json(
        { error: result.error, details: result.details },
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
