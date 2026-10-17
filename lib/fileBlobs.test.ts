import { describe, expect, it } from "vitest";
import { blobToBuffer, buildFileBlobData, XLSX_MIME_TYPE } from "@/lib/fileBlobs";

// Tests for the FileBlob storage helpers (#131).

describe("buildFileBlobData", () => {
  it("derives the byte size from the buffer", () => {
    const data = Buffer.from("hello");
    expect(
      buildFileBlobData({
        fileName: "upload.xlsx",
        mimeType: XLSX_MIME_TYPE,
        data,
      }),
    ).toEqual({
      fileName: "upload.xlsx",
      mimeType: XLSX_MIME_TYPE,
      sizeBytes: 5,
      data,
    });
  });

  it("reports zero for an empty buffer", () => {
    const { sizeBytes } = buildFileBlobData({
      fileName: "empty.xlsx",
      mimeType: XLSX_MIME_TYPE,
      data: Buffer.alloc(0),
    });
    expect(sizeBytes).toBe(0);
  });
});

describe("blobToBuffer", () => {
  it("converts the Uint8Array Prisma returns back to a Buffer", () => {
    const buffer = blobToBuffer(new Uint8Array([1, 2, 3]));
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.equals(Buffer.from([1, 2, 3]))).toBe(true);
  });
});
