import { prisma } from "../lib/prisma";

// Creates/updates the read-only role clx_readonly in a LOCAL database (docker compose),
// so the SQL query UI works there too (#121). Hosts (dev instance, production) use
// deploy/prod/postgres/readonly-role.sh instead - this is its local mirror, so keep the
// whitelist below in sync with READ_TABLES there.
// Idempotent: safe to run repeatedly. Re-run if a migration recreates one of the tables,
// because grants are attached to the table objects.

const ROLE = "clx_readonly";

// Whitelist: only the catch data is readable. User, Session, PasswordResets, Uploads,
// UserQueries, TemplateFiles, FileBlob and QueryLog stay invisible to this role.
const READ_TABLES = ["fish_catches", "samplings", "river_sites", "fish_species"];

async function main() {
  const password = process.env.READONLY_DB_PASSWORD ?? "clxreadonly";
  const literal = `'${password.replace(/'/g, "''")}'`;

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN
        CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 108 PASSWORD ${literal};
      ELSE
        ALTER ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 108 PASSWORD ${literal};
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
    ...READ_TABLES.map((t) => `GRANT SELECT ON TABLE public."${t}" TO ${ROLE}`),
    // Future tables (QueryLog, ...) must not become readable by default.
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM ${ROLE}`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }

  console.log(`Role ${ROLE} ready (SELECT on ${READ_TABLES.join(", ")}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
