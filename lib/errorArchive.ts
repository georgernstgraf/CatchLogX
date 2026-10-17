import JSZip from "jszip";
import { randomUUID } from "node:crypto";

/**
 * In-memory archive of annotated error files (#88). The ZIP is handed back to
 * the user via a short-lived token and is NEVER persisted — neither in the
 * database nor on disk — so a failed upload leaves nothing behind.
 */

export type ArchiveEntry = { fileName: string; data: Buffer };

/** How long a generated error archive stays retrievable. */
export const ARCHIVE_TTL_MS = 15 * 60 * 1000;

const store = new Map<string, { data: Buffer; expiresAt: number }>();

/** Builds a ZIP from the given entries. */
export async function buildZip(entries: ArchiveEntry[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.fileName, entry.data);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Stores an archive and returns its one-time token. */
export function putArchive(data: Buffer, now = Date.now()): string {
  const token = randomUUID();
  store.set(token, { data, expiresAt: now + ARCHIVE_TTL_MS });
  return token;
}

/** Returns a stored archive, or `null` if the token is unknown or expired. */
export function getArchive(token: string, now = Date.now()): Buffer | null {
  const entry = store.get(token);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= now) {
    store.delete(token);
    return null;
  }
  return entry.data;
}

/** Drops expired archives. Called on access; keeps the map bounded. */
export function pruneArchives(now = Date.now()): void {
  for (const [token, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(token);
    }
  }
}

/** Exported for unit tests (#112). */
export function clearArchiveStore(): void {
  store.clear();
}
