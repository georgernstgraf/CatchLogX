import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the dummy file service (#96): listing, creation, visibility,
// soft deletion and download access rules. Prisma and MinIO are mocked.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dummyFiles: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/minio", () => ({
  uploadDummyFile: vi.fn(),
  downloadDummyFileByObjectKey: vi.fn(),
}));

import { downloadDummyFileByObjectKey, uploadDummyFile } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import {
  createDummyFile,
  getDummyFileForDownload,
  listDummyFiles,
  setDummyFileVisibility,
  softDeleteDummyFile,
} from "@/services/dummyFileService";

const NOW = new Date("2025-01-15T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listDummyFiles", () => {
  it("returns only visible, non-deleted files for regular users", async () => {
    vi.mocked(prisma.dummyFiles.findMany).mockResolvedValue([]);

    await listDummyFiles(false);

    expect(prisma.dummyFiles.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ isDeleted: false }, { isDeleted: null }],
          isVisible: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("also returns hidden files when includeHidden is set", async () => {
    vi.mocked(prisma.dummyFiles.findMany).mockResolvedValue([]);

    await listDummyFiles(true);

    expect(prisma.dummyFiles.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ isDeleted: false }, { isDeleted: null }] },
      }),
    );
  });
});

describe("createDummyFile", () => {
  const input = {
    fileBuffer: Buffer.from("data"),
    filename: "sample.xlsx",
    contentType: "application/vnd.ms-excel",
    uploadedByUserId: "admin-1",
  };

  it("stores the file in MinIO and registers it as visible", async () => {
    vi.mocked(uploadDummyFile).mockResolvedValue({
      objectKey: "root/dummy_files/ts/sample.xlsx",
      timestampFolder: "ts",
      filename: "sample.xlsx",
    });
    vi.mocked(prisma.dummyFiles.create).mockResolvedValue({ id: "d1" } as any);

    const created = await createDummyFile(input);

    expect(uploadDummyFile).toHaveBeenCalledWith(
      input.fileBuffer,
      "sample.xlsx",
      "application/vnd.ms-excel",
    );
    expect(prisma.dummyFiles.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          fileName: "sample.xlsx",
          filePath: "root/dummy_files/ts/sample.xlsx",
          uploadedByUserId: "admin-1",
          isVisible: true,
          isDeleted: false,
        },
      }),
    );
    expect(created).toEqual({ id: "d1" });
  });

  it("does not create a DB record when the MinIO upload fails", async () => {
    vi.mocked(uploadDummyFile).mockRejectedValue(new Error("minio down"));

    await expect(createDummyFile(input)).rejects.toThrow("minio down");
    expect(prisma.dummyFiles.create).not.toHaveBeenCalled();
  });
});

describe("setDummyFileVisibility", () => {
  it("updates only the visibility flag of the given file", async () => {
    vi.mocked(prisma.dummyFiles.update).mockResolvedValue({ id: "d1" } as any);

    await setDummyFileVisibility("d1", false);

    expect(prisma.dummyFiles.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: { isVisible: false },
      }),
    );
  });
});

describe("softDeleteDummyFile", () => {
  it("marks the record as deleted with a timestamp and keeps the object", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      await softDeleteDummyFile("d1");
    } finally {
      vi.useRealTimers();
    }

    expect(prisma.dummyFiles.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { isDeleted: true, deletedAt: NOW },
    });
    expect(downloadDummyFileByObjectKey).not.toHaveBeenCalled();
  });
});

describe("getDummyFileForDownload", () => {
  const record = (overrides: Record<string, unknown> = {}) => ({
    fileName: "sample.xlsx",
    filePath: "root/dummy_files/ts/sample.xlsx",
    isVisible: true,
    isDeleted: false,
    ...overrides,
  });

  beforeEach(() => {
    vi.mocked(downloadDummyFileByObjectKey).mockResolvedValue({
      objectKey: "root/dummy_files/ts/sample.xlsx",
      fileBuffer: Buffer.from("bytes"),
    });
  });

  it("returns null for an unknown id", async () => {
    vi.mocked(prisma.dummyFiles.findUnique).mockResolvedValue(null);

    expect(await getDummyFileForDownload("nope", true)).toBeNull();
    expect(downloadDummyFileByObjectKey).not.toHaveBeenCalled();
  });

  it("returns null for a deleted file, even for admins", async () => {
    vi.mocked(prisma.dummyFiles.findUnique).mockResolvedValue(
      record({ isDeleted: true }) as any,
    );

    expect(await getDummyFileForDownload("d1", true)).toBeNull();
    expect(downloadDummyFileByObjectKey).not.toHaveBeenCalled();
  });

  it("hides hidden files from regular users", async () => {
    vi.mocked(prisma.dummyFiles.findUnique).mockResolvedValue(
      record({ isVisible: false }) as any,
    );

    expect(await getDummyFileForDownload("d1", false)).toBeNull();
    expect(downloadDummyFileByObjectKey).not.toHaveBeenCalled();
  });

  it("lets admins download hidden files", async () => {
    vi.mocked(prisma.dummyFiles.findUnique).mockResolvedValue(
      record({ isVisible: false }) as any,
    );

    const download = await getDummyFileForDownload("d1", true);

    expect(download?.fileName).toBe("sample.xlsx");
    expect(download?.fileBuffer.toString()).toBe("bytes");
  });

  it("lets regular users download visible files", async () => {
    vi.mocked(prisma.dummyFiles.findUnique).mockResolvedValue(
      record() as any,
    );

    const download = await getDummyFileForDownload("d1", false);

    expect(downloadDummyFileByObjectKey).toHaveBeenCalledWith(
      "root/dummy_files/ts/sample.xlsx",
    );
    expect(download?.fileName).toBe("sample.xlsx");
  });
});
