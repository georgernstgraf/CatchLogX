import { prisma } from "@/lib/prisma";
import { blobToBuffer, buildFileBlobData } from "@/lib/fileBlobs";

/** Columns of a template file that are exposed to API clients. */
const templateFileSelect = {
  id: true,
  fileName: true,
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
 * Stores the file and registers it as a visible template file. The bytes and
 * the row are written in a single nested create (#131), so they cannot drift.
 *
 * @returns The created database record.
 */
export async function createTemplateFile({
  fileBuffer,
  filename,
  contentType,
  uploadedByUserId,
}: CreateTemplateFileInput) {
  return prisma.templateFiles.create({
    data: {
      fileName: filename,
      uploadedByUserId,
      isVisible: true,
      isDeleted: false,
      blob: {
        create: buildFileBlobData({
          fileName: filename,
          mimeType: contentType,
          data: fileBuffer,
        }),
      },
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

/** Soft-deletes a template file; the blob is kept. */
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
 * Loads a template file for download.
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
      isVisible: true,
      isDeleted: true,
      blob: { select: { data: true } },
    },
  });

  if (!templateFile || templateFile.isDeleted) {
    return null;
  }

  if (!templateFile.isVisible && !canSeeHidden) {
    return null;
  }

  return {
    fileName: templateFile.fileName,
    fileBuffer: blobToBuffer(templateFile.blob.data),
  };
}
