import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the template file service (#96): listing, creation, visibility,
// soft deletion and download access rules. Prisma is mocked; file bytes live
// in the database (#131).
vi.mock("@/lib/prisma", () => ({
  prisma: {
    templateFiles: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  createTemplateFile,
  getTemplateFileForDownload,
  listTemplateFiles,
  setTemplateFileVisibility,
  softDeleteTemplateFile,
} from "@/services/templateFileService";

const NOW = new Date("2025-01-15T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listTemplateFiles", () => {
  it("returns only visible, non-deleted files for regular users", async () => {
    vi.mocked(prisma.templateFiles.findMany).mockResolvedValue([]);

    await listTemplateFiles(false);

    expect(prisma.templateFiles.findMany).toHaveBeenCalledWith(
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
    vi.mocked(prisma.templateFiles.findMany).mockResolvedValue([]);

    await listTemplateFiles(true);

    expect(prisma.templateFiles.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ isDeleted: false }, { isDeleted: null }] },
      }),
    );
  });
});

describe("createTemplateFile", () => {
  const input = {
    fileBuffer: Buffer.from("data"),
    filename: "sample.xlsx",
    contentType: "application/vnd.ms-excel",
    uploadedByUserId: "admin-1",
  };

  it("stores the bytes and the row in a single nested create", async () => {
    vi.mocked(prisma.templateFiles.create).mockResolvedValue({ id: "d1" } as any);

    const created = await createTemplateFile(input);

    expect(prisma.templateFiles.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          fileName: "sample.xlsx",
          uploadedByUserId: "admin-1",
          isVisible: true,
          isDeleted: false,
          blob: {
            create: {
              fileName: "sample.xlsx",
              mimeType: "application/vnd.ms-excel",
              sizeBytes: 4,
              data: input.fileBuffer,
            },
          },
        },
      }),
    );
    expect(created).toEqual({ id: "d1" });
  });
});

describe("setTemplateFileVisibility", () => {
  it("updates only the visibility flag of the given file", async () => {
    vi.mocked(prisma.templateFiles.update).mockResolvedValue({ id: "d1" } as any);

    await setTemplateFileVisibility("d1", false);

    expect(prisma.templateFiles.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: { isVisible: false },
      }),
    );
  });
});

describe("softDeleteTemplateFile", () => {
  it("marks the record as deleted with a timestamp and keeps the blob", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      await softDeleteTemplateFile("d1");
    } finally {
      vi.useRealTimers();
    }

    expect(prisma.templateFiles.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { isDeleted: true, deletedAt: NOW },
    });
  });
});

describe("getTemplateFileForDownload", () => {
  const record = (overrides: Record<string, unknown> = {}) => ({
    fileName: "sample.xlsx",
    isVisible: true,
    isDeleted: false,
    blob: { data: new Uint8Array([98, 121, 116, 101, 115]) }, // "bytes"
    ...overrides,
  });

  it("returns null for an unknown id", async () => {
    vi.mocked(prisma.templateFiles.findUnique).mockResolvedValue(null);

    expect(await getTemplateFileForDownload("nope", true)).toBeNull();
  });

  it("returns null for a deleted file, even for admins", async () => {
    vi.mocked(prisma.templateFiles.findUnique).mockResolvedValue(
      record({ isDeleted: true }) as any,
    );

    expect(await getTemplateFileForDownload("d1", true)).toBeNull();
  });

  it("hides hidden files from regular users", async () => {
    vi.mocked(prisma.templateFiles.findUnique).mockResolvedValue(
      record({ isVisible: false }) as any,
    );

    expect(await getTemplateFileForDownload("d1", false)).toBeNull();
  });

  it("lets admins download hidden files", async () => {
    vi.mocked(prisma.templateFiles.findUnique).mockResolvedValue(
      record({ isVisible: false }) as any,
    );

    const download = await getTemplateFileForDownload("d1", true);

    expect(download?.fileName).toBe("sample.xlsx");
    expect(download?.fileBuffer.toString()).toBe("bytes");
  });

  it("lets regular users download visible files", async () => {
    vi.mocked(prisma.templateFiles.findUnique).mockResolvedValue(
      record() as any,
    );

    const download = await getTemplateFileForDownload("d1", false);

    expect(download?.fileName).toBe("sample.xlsx");
    expect(download?.fileBuffer.toString()).toBe("bytes");
  });
});
