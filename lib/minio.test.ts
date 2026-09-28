import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the MinIO helpers (#112).
// The minio SDK is mocked: no bucket is ever contacted.
const client = vi.hoisted(() => ({
  bucketExists: vi.fn(),
  makeBucket: vi.fn(),
  putObject: vi.fn(),
  getObject: vi.fn(),
}));

vi.mock("minio", () => ({
  Client: vi.fn(function () {
    return client;
  }),
}));

// lib/minio caches the "structure ensured" promise at module level,
// so every test gets a fresh module instance.
async function loadMinio() {
  vi.resetModules();
  return import("@/lib/minio");
}

beforeEach(() => {
  vi.clearAllMocks();
  client.bucketExists.mockResolvedValue(true);
});

describe("pure key helpers", () => {
  it("sanitizeFilename replaces path separators and trims", async () => {
    const { sanitizeFilename } = await loadMinio();
    expect(sanitizeFilename(" ../evil\\name.xlsx ")).toBe(".._evil_name.xlsx");
  });

  it("getUploadObjectKey prefixes the uploads folder", async () => {
    const { getUploadObjectKey, uploadsPrefix } = await loadMinio();
    expect(getUploadObjectKey("a/b.xlsx")).toBe(`${uploadsPrefix}/a_b.xlsx`);
  });

  it("formatTimestampFolder zero-pads every part", async () => {
    const { formatTimestampFolder } = await loadMinio();
    expect(formatTimestampFolder(new Date(2024, 0, 2, 3, 4, 5))).toBe(
      "20240102030405",
    );
  });
});

describe("ensureMinioStructure", () => {
  it("creates the bucket only when it is missing", async () => {
    client.bucketExists.mockResolvedValue(false);
    const { ensureMinioStructure, minioBucketName } = await loadMinio();

    await ensureMinioStructure();

    expect(client.makeBucket).toHaveBeenCalledWith(minioBucketName);
    expect(client.putObject).toHaveBeenCalledTimes(2);
  });

  it("does not recreate an existing bucket", async () => {
    const { ensureMinioStructure } = await loadMinio();
    await ensureMinioStructure();
    expect(client.makeBucket).not.toHaveBeenCalled();
  });

  it("runs the setup only once per process", async () => {
    const { ensureMinioStructure } = await loadMinio();
    await ensureMinioStructure();
    await ensureMinioStructure();
    expect(client.bucketExists).toHaveBeenCalledTimes(1);
  });
});

describe("upload / download", () => {
  it("uploadUploadFile stores the buffer under the uploads key", async () => {
    const { uploadUploadFile, minioBucketName, uploadsPrefix } =
      await loadMinio();
    const buffer = Buffer.from("xlsx");

    const result = await uploadUploadFile(buffer, "file.xlsx");

    expect(result).toEqual({
      objectKey: `${uploadsPrefix}/file.xlsx`,
      filename: "file.xlsx",
    });
    expect(client.putObject).toHaveBeenLastCalledWith(
      minioBucketName,
      `${uploadsPrefix}/file.xlsx`,
      buffer,
      buffer.length,
      {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    );
  });

  it("uploadDummyFile stores the buffer in a timestamp folder", async () => {
    const { uploadDummyFile, dummyFilesPrefix } = await loadMinio();

    const result = await uploadDummyFile(Buffer.from("x"), "dummy.xlsx");

    expect(result.timestampFolder).toMatch(/^\d{14}$/);
    expect(result.objectKey).toBe(
      `${dummyFilesPrefix}/${result.timestampFolder}/dummy.xlsx`,
    );
  });

  it("downloadUploadFile concatenates the object stream into a buffer", async () => {
    client.getObject.mockResolvedValue(
      Readable.from([Buffer.from("he"), Buffer.from("llo")]),
    );
    const { downloadUploadFile, uploadsPrefix } = await loadMinio();

    const { objectKey, fileBuffer } = await downloadUploadFile("file.xlsx");

    expect(objectKey).toBe(`${uploadsPrefix}/file.xlsx`);
    expect(fileBuffer.toString()).toBe("hello");
  });

  it("propagates stream errors", async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error("boom"));
      },
    });
    client.getObject.mockResolvedValue(stream);
    const { downloadDummyFileByObjectKey } = await loadMinio();

    await expect(downloadDummyFileByObjectKey("key")).rejects.toThrow("boom");
  });
});
