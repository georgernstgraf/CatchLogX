import { prisma } from "../lib/prisma";

// Creates/updates the read-only PostgreSQL role used by the SQL query UI (#121).
// Idempotent: safe to run repeatedly. Re-run if a migration recreates one of the tables,
// because grants are attached to the table objects.

const ROLE = "clx_query";

// Whitelist: only the catch data is queryable. User, Session, PasswordResets, Uploads,
// UserQueries, TemplateFiles, FileBlob and QueryLog stay invisible to this role.
const READABLE_TABLES = ["fish_catches", "samplings", "river_sites", "fish_species"];

async function main() {
  const password = process.env.QUERY_DB_PASSWORD ?? "clxquery";
  const literal = `'${password.replace(/'/g, "''")}'`;

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN
        CREATE ROLE ${ROLE} LOGIN PASSWORD ${literal};
      ELSE
        ALTER ROLE ${ROLE} LOGIN PASSWORD ${literal};
      END IF;
    END
    $$;
  `);

  const [{ db }] = await prisma.$queryRawUnsafe<{ db: string }[]>(
    "SELECT current_database() AS db",
  );

  const statements = [
    `GRANT CONNECT ON DATABASE "${db}" TO ${ROLE}`,
    `GRANT USAGE ON SCHEMA public TO ${ROLE}`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE}`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${ROLE}`,
    `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${ROLE}`,
    ...READABLE_TABLES.map((t) => `GRANT SELECT ON TABLE public."${t}" TO ${ROLE}`),
    `ALTER ROLE ${ROLE} SET default_transaction_read_only = on`,
    `ALTER ROLE ${ROLE} SET statement_timeout = '10s'`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }

  console.log(`Role ${ROLE} ready (SELECT on ${READABLE_TABLES.join(", ")}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
