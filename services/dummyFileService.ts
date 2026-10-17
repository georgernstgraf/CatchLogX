import { prisma } from "@/lib/prisma";
import { downloadDummyFileByObjectKey, uploadDummyFile } from "@/lib/minio";

/** Columns of a dummy file that are exposed to API clients. */
const dummyFileSelect = {
  id: true,
  fileName: true,
  filePath: true,
  uploadedByUserId: true,
  createdAt: true,
  isVisible: true,
} as const;

/** Input for {@link createDummyFile}. */
export type CreateDummyFileInput = {
  fileBuffer: Buffer;
  filename: string;
  contentType: string;
  uploadedByUserId: string;
};

/** A dummy file ready to be streamed to the client. */
export type DummyFileDownload = {
  fileName: string;
  fileBuffer: Buffer;
};

/**
 * Lists all non-deleted dummy files, newest first.
 *
 * @param includeHidden - `true` also returns files an admin has hidden from regular users.
 */
export async function listDummyFiles(includeHidden: boolean) {
  return prisma.dummyFiles.findMany({
    where: {
      OR: [{ isDeleted: false }, { isDeleted: null }],
      ...(includeHidden ? {} : { isVisible: true }),
    },
    orderBy: {
      createdAt: "desc",
    },
    select: dummyFileSelect,
  });
}

/**
 * Stores the file in MinIO and registers it as a visible dummy file.
 *
 * @returns The created database record.
 */
export async function createDummyFile({
  fileBuffer,
  filename,
  contentType,
  uploadedByUserId,
}: CreateDummyFileInput) {
  const stored = await uploadDummyFile(fileBuffer, filename, contentType);

  return prisma.dummyFiles.create({
    data: {
      fileName: stored.filename,
      filePath: stored.objectKey,
      uploadedByUserId,
      isVisible: true,
      isDeleted: false,
    },
    select: dummyFileSelect,
  });
}

/** Shows or hides a dummy file for regular users. */
export async function setDummyFileVisibility(id: string, isVisible: boolean) {
  return prisma.dummyFiles.update({
    where: { id },
    data: { isVisible },
    select: dummyFileSelect,
  });
}

/** Soft-deletes a dummy file; the MinIO object is kept. */
export async function softDeleteDummyFile(id: string): Promise<void> {
  await prisma.dummyFiles.update({
    where: { id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
  });
}

/**
 * Loads a dummy file from MinIO for download.
 *
 * @param id - Dummy file id.
 * @param canSeeHidden - Whether the requester may access hidden files (admins).
 * @returns The file, or `null` if it is unknown, deleted or hidden from the requester.
 */
export async function getDummyFileForDownload(
  id: string,
  canSeeHidden: boolean,
): Promise<DummyFileDownload | null> {
  const dummyFile = await prisma.dummyFiles.findUnique({
    where: { id },
    select: {
      fileName: true,
      filePath: true,
      isVisible: true,
      isDeleted: true,
    },
  });

  if (!dummyFile || dummyFile.isDeleted) {
    return null;
  }

  if (!dummyFile.isVisible && !canSeeHidden) {
    return null;
  }

  const { fileBuffer } = await downloadDummyFileByObjectKey(dummyFile.filePath);

  return { fileName: dummyFile.fileName, fileBuffer };
}
