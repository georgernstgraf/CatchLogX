/**
 * Storage conventions for {@link FileBlob} rows (#131). File bytes live in
 * PostgreSQL; these helpers keep the mime/size rules in one place and stay
 * free of I/O so they are trivial to unit test.
 */

export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Input for a new `FileBlob` row. */
export type FileBlobInput = {
  fileName: string;
  mimeType: string;
  data: Buffer;
};

/** Shapes a file buffer into the fields of a `FileBlob` row. */
export function buildFileBlobData({ fileName, mimeType, data }: FileBlobInput) {
  return {
    fileName,
    mimeType,
    sizeBytes: data.length,
    data,
  };
}

/** Prisma hands BYTEA back as `Uint8Array`; normalise it to a `Buffer`. */
export function blobToBuffer(data: Uint8Array): Buffer {
  return Buffer.from(data);
}
