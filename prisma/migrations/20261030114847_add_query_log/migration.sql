-- CreateTable
CREATE TABLE "QueryLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "rowCount" INTEGER,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "QueryLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "QueryLog" ADD CONSTRAINT "QueryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- QueryLog holds query text and user ids and must stay private (#121). clx_readonly
-- (#152) has a shared password and receives SELECT on every new table through
-- ALTER DEFAULT PRIVILEGES, so take it back here. The role only exists on the
-- dev instance and in production, not in CI or local databases.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clx_readonly') THEN
    REVOKE ALL ON TABLE "QueryLog" FROM clx_readonly;
  END IF;
END
$$;
