import { beforeEach, describe, expect, it, vi } from "vitest";

const { clientOptions } = vi.hoisted(() => ({ clientOptions: [] as any[] }));

vi.mock("../app/generated/prisma", () => ({
  PrismaClient: class {
    constructor(options: unknown) {
      clientOptions.push(options);
    }
  },
}));

import { getQueryPrisma, QUERY_POOL_SIZE } from "./queryPrisma";

const READONLY_URL = "postgresql://clx_readonly:pw@127.0.0.1:5432/clx";

describe("getQueryPrisma", () => {
  beforeEach(() => {
    clientOptions.length = 0;
    delete (globalThis as any).queryPrisma;
    vi.unstubAllEnvs();
  });

  it("fails closed without QUERY_DATABASE_URL instead of using the admin URL", () => {
    vi.stubEnv("QUERY_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "postgresql://clxadmin:secret@localhost/clx");

    expect(() => getQueryPrisma()).toThrow(/QUERY_DATABASE_URL is not set/);
    expect(() => getQueryPrisma()).toThrow(/clx_readonly/);
    expect(clientOptions).toEqual([]);
  });

  it("connects with QUERY_DATABASE_URL", () => {
    vi.stubEnv("QUERY_DATABASE_URL", READONLY_URL);

    getQueryPrisma();

    expect(clientOptions).toHaveLength(1);
    const url = new URL(clientOptions[0].datasourceUrl);
    expect(`${url.protocol}//${url.username}:${url.password}@${url.host}${url.pathname}`).toBe(
      READONLY_URL,
    );
    expect(clientOptions[0].log).toEqual([]);
  });

  // The env URL stays libpq-compatible (psql rejects ?connection_limit=), so the
  // pool cap is added in code, only for the Prisma client (#121).
  it("caps the pool in code, not in the env URL", () => {
    vi.stubEnv("QUERY_DATABASE_URL", READONLY_URL);

    getQueryPrisma();

    expect(clientOptions[0].datasourceUrl).toBe(
      `${READONLY_URL}?connection_limit=${QUERY_POOL_SIZE}`,
    );
    expect(process.env.QUERY_DATABASE_URL).toBe(READONLY_URL);
  });

  it("keeps libpq parameters of the env URL when adding the pool cap", () => {
    vi.stubEnv("QUERY_DATABASE_URL", `${READONLY_URL}?sslmode=require`);

    getQueryPrisma();

    const params = new URL(clientOptions[0].datasourceUrl).searchParams;
    expect(params.get("sslmode")).toBe("require");
    expect(params.get("connection_limit")).toBe(String(QUERY_POOL_SIZE));
  });

  it("reuses one client", () => {
    vi.stubEnv("QUERY_DATABASE_URL", READONLY_URL);

    expect(getQueryPrisma()).toBe(getQueryPrisma());
    expect(clientOptions).toHaveLength(1);
  });
});
