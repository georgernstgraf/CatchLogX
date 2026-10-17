import { prisma } from "@/lib/prisma";
import { downloadTemplateFileByObjectKey, uploadTemplateFile } from "@/lib/minio";

/** Columns of a template file that are exposed to API clients. */
const templateFileSelect = {
  id: true,
  fileName: true,
  filePath: true,
  uploadedByUserId: true,
  createdAt: true,
  isVisible: true,
} as const;

/** Input for {@link createTemplateFile}. */
export type CreateTemplateFileInput = {
  fileBuffer: Buffer;
  filename: string;
  contentType: string;
  uploadedByUserId: string;
};

/** A template file ready to be streamed to the client. */
export type TemplateFileDownload = {
  fileName: string;
  fileBuffer: Buffer;
};

/**
 * Lists all non-deleted template files, newest first.
 *
 * @param includeHidden - `true` also returns files an admin has hidden from regular users.
 */
export async function listTemplateFiles(includeHidden: boolean) {
  return prisma.templateFiles.findMany({
    where: {
      OR: [{ isDeleted: false }, { isDeleted: null }],
      ...(includeHidden ? {} : { isVisible: true }),
    },
    orderBy: {
      createdAt: "desc",
    },
    select: templateFileSelect,
  });
}

/**
 * Stores the file in MinIO and registers it as a visible template file.
 *
 * @returns The created database record.
 */
export async function createTemplateFile({
  fileBuffer,
  filename,
  contentType,
  uploadedByUserId,
}: CreateTemplateFileInput) {
  const stored = await uploadTemplateFile(fileBuffer, filename, contentType);

  return prisma.templateFiles.create({
    data: {
      fileName: stored.filename,
      filePath: stored.objectKey,
      uploadedByUserId,
      isVisible: true,
      isDeleted: false,
    },
    select: templateFileSelect,
  });
}

/** Shows or hides a template file for regular users. */
export async function setTemplateFileVisibility(id: string, isVisible: boolean) {
  return prisma.templateFiles.update({
    where: { id },
    data: { isVisible },
    select: templateFileSelect,
  });
}

/** Soft-deletes a template file; the MinIO object is kept. */
export async function softDeleteTemplateFile(id: string): Promise<void> {
  await prisma.templateFiles.update({
    where: { id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
  });
}

/**
 * Loads a template file from MinIO for download.
 *
 * @param id - Template file id.
 * @param canSeeHidden - Whether the requester may access hidden files (admins).
 * @returns The file, or `null` if it is unknown, deleted or hidden from the requester.
 */
export async function getTemplateFileForDownload(
  id: string,
  canSeeHidden: boolean,
): Promise<TemplateFileDownload | null> {
  const templateFile = await prisma.templateFiles.findUnique({
    where: { id },
    select: {
      fileName: true,
      filePath: true,
      isVisible: true,
      isDeleted: true,
    },
  });

  if (!templateFile || templateFile.isDeleted) {
    return null;
  }

  if (!templateFile.isVisible && !canSeeHidden) {
    return null;
  }

  const { fileBuffer } = await downloadTemplateFileByObjectKey(templateFile.filePath);

  return { fileName: templateFile.fileName, fileBuffer };
}
