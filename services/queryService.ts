import { prisma } from "@/lib/prisma";
import { getQueryPrisma } from "@/lib/queryPrisma";

// No keyword heuristics any more (#121): user SQL runs as the read-only role `clx_readonly`,
// so PostgreSQL permissions decide what is allowed. Only reject empty input here.

export function validateSQLQuery(query: string): {
  isValid: boolean;
  error?: string;
} {
  if (!query || typeof query !== "string") {
    return { isValid: false, error: "Query ist leer oder kein String" };
  }

  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return { isValid: false, error: "Query ist leer" };
  }

  return { isValid: true };
}

// PostgreSQL "insufficient_privilege" (also raised for writes in a read-only transaction: 25006).
// Exported for unit tests (#112).
export function isPermissionDenied(error: unknown): boolean {
  // Prisma wraps raw-query DB errors as P2010 with the SQLSTATE in meta.code.
  const sqlState = (error as any)?.meta?.code;
  if (sqlState === "42501" || sqlState === "25006") return true;
  const text = error instanceof Error ? error.message : String(error);
  return /\b(42501|25006)\b|permission denied|read-only transaction/i.test(text);
}

// Prefer the plain PostgreSQL message over Prisma's multi-line "Invalid invocation" wrapper.
function dbErrorText(error: unknown): string {
  const meta = (error as any)?.meta;
  if (meta?.message) return meta.code ? `${meta.code}: ${meta.message}` : String(meta.message);
  return error instanceof Error ? error.message : String(error);
}

async function logQuery(entry: {
  userId: string;
  query: string;
  success: boolean;
  error?: string;
  rowCount?: number;
  durationMs: number;
}) {
  try {
    await prisma.queryLog.create({ data: entry });
  } catch (logError) {
    // Logging must never change the answer the user gets.
    console.error("Failed to write QueryLog entry:", logError);
  }
}

export async function executeQuery(query: string, userId: string) {
  const started = Date.now();
  let data: unknown;

  try {
    data = await getQueryPrisma().$queryRawUnsafe(query);
  } catch (error) {
    await logQuery({
      userId,
      query,
      success: false,
      error: dbErrorText(error),
      durationMs: Date.now() - started,
    });
    throw error;
  }

  await logQuery({
    userId,
    query,
    success: true,
    rowCount: Array.isArray(data) ? data.length : undefined,
    durationMs: Date.now() - started,
  });

  const serializedData = JSON.parse(
    JSON.stringify(data, (key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );

  return {
    timestamp: new Date(),
    query,
    result: serializedData,
  };
}
