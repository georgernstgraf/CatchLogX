import { PrismaClient } from "../app/generated/prisma";

// Prisma client connected as the read-only role `clx_query` (#121).
// Used only for user-written SQL from the query UI; the DB permissions are the security boundary.
// No fallback to DATABASE_URL: that would silently run user SQL with admin rights.

const globalForQueryPrisma = globalThis as unknown as {
  queryPrisma: PrismaClient | undefined;
};

export function getQueryPrisma(): PrismaClient {
  if (globalForQueryPrisma.queryPrisma) return globalForQueryPrisma.queryPrisma;

  const url = process.env.QUERY_DATABASE_URL;
  if (!url) {
    throw new Error(
      "QUERY_DATABASE_URL is not set – the SQL query UI needs the read-only role (npm run db:query-role).",
    );
  }

  const client = new PrismaClient({ datasourceUrl: url, log: [] });
  globalForQueryPrisma.queryPrisma = client;
  return client;
}
