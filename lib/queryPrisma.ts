import { PrismaClient } from "../app/generated/prisma";

// Prisma client connected as the read-only role `clx_readonly` (#121) - the same
// whitelisted account the research group uses in psql/R (deploy/prod/postgres/readonly-role.sh).
// Used only for user-written SQL from the query UI; the DB permissions are the security boundary.
// No fallback to DATABASE_URL: that would silently run user SQL with admin rights.

// The role's CONNECTION LIMIT is shared with the research group, so the SQL page keeps a
// small pool. Prisma 6 only reads the cap from the URL, but QUERY_DATABASE_URL must stay a
// plain libpq URL (psql rejects `?connection_limit=`), so it is added here, in code.
// Exported for unit tests (#112).
export const QUERY_POOL_SIZE = 5;

const globalForQueryPrisma = globalThis as unknown as {
  queryPrisma: PrismaClient | undefined;
};

export function getQueryPrisma(): PrismaClient {
  if (globalForQueryPrisma.queryPrisma) return globalForQueryPrisma.queryPrisma;

  const url = process.env.QUERY_DATABASE_URL;
  if (!url) {
    throw new Error(
      "QUERY_DATABASE_URL is not set – the SQL query UI needs the read-only role clx_readonly.",
    );
  }

  const datasourceUrl = new URL(url);
  datasourceUrl.searchParams.set("connection_limit", String(QUERY_POOL_SIZE));

  const client = new PrismaClient({ datasourceUrl: datasourceUrl.toString(), log: [] });
  globalForQueryPrisma.queryPrisma = client;
  return client;
}
