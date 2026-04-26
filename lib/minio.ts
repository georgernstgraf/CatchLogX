import * as Minio from "minio";

const minioPort = Number(process.env.MINIO_PORT ?? "9000");
const minioUseSsl = process.env.MINIO_USE_SSL === "true";

export const minioBucketName = process.env.MINIO_BUCKET ?? "catchlogx-files";
const minioRootPrefix = process.env.MINIO_ROOT_PREFIX ?? "CatchLogX";

export const uploadsPrefix = `${minioRootPrefix}/uploads`;
export const dummyFilesPrefix = `${minioRootPrefix}/dummy_files`;

const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
  port: minioPort,
  useSSL: minioUseSsl,
  accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
});

let ensureStructurePromise: Promise<void> | null = null;

function sanitizeFilename(filename: string) {
  return filename.replace(/[\\/]/g, "_").trim();
}

export function getUploadObjectKey(filename: string) {
  return `${uploadsPrefix}/${sanitizeFilename(filename)}`;
}

function getDummyFileObjectKey(timestampFolder: string, filename: string) {
  return `${dummyFilesPrefix}/${timestampFolder}/${sanitizeFilename(filename)}`;
}

export function formatTimestampFolder(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.once("error", reject);
    stream.once("end", () => resolve(Buffer.concat(chunks)));
  });
}

export async function ensureMinioStructure() {
  if (!ensureStructurePromise) {
    ensureStructurePromise = (async () => {
      const bucketExists = await client.bucketExists(minioBucketName);

      if (!bucketExists) {
        await client.makeBucket(minioBucketName);
      }

      await client.putObject(
        minioBucketName,
        `${uploadsPrefix}/.keep`,
        Buffer.alloc(0),
      );
      await client.putObject(
        minioBucketName,
        `${dummyFilesPrefix}/.keep`,
        Buffer.alloc(0),
      );
    })();
  }

  await ensureStructurePromise;
}

export async function uploadUploadFile(
  fileBuffer: Buffer,
  filename: string,
  contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
) {
  await ensureMinioStructure();

  const objectKey = getUploadObjectKey(filename);
  await client.putObject(
    minioBucketName,
    objectKey,
    fileBuffer,
    fileBuffer.length,
    {
      "Content-Type": contentType,
    },
  );

  return { objectKey, filename };
}

export async function uploadDummyFile(
  fileBuffer: Buffer,
  filename: string,
  contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
) {
  await ensureMinioStructure();

  const timestampFolder = formatTimestampFolder();
  const objectKey = getDummyFileObjectKey(timestampFolder, filename);

  await client.putObject(
    minioBucketName,
    objectKey,
    fileBuffer,
    fileBuffer.length,
    {
      "Content-Type": contentType,
    },
  );

  return { objectKey, timestampFolder, filename };
}

export async function getObjectBuffer(objectKey: string) {
  await ensureMinioStructure();
  const stream = await client.getObject(minioBucketName, objectKey);
  return streamToBuffer(stream);
}

export async function downloadUploadFile(filename: string) {
  const objectKey = getUploadObjectKey(filename);
  const fileBuffer = await getObjectBuffer(objectKey);

  return { objectKey, fileBuffer };
}
