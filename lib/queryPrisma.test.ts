import { beforeEach, describe, expect, it, vi } from "vitest";

const { clientOptions } = vi.hoisted(() => ({ clientOptions: [] as unknown[] }));

vi.mock("../app/generated/prisma", () => ({
  PrismaClient: class {
    constructor(options: unknown) {
      clientOptions.push(options);
    }
  },
}));

import { getQueryPrisma } from "./queryPrisma";

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
    expect(clientOptions).toEqual([]);
  });

  it("connects with QUERY_DATABASE_URL", () => {
    vi.stubEnv("QUERY_DATABASE_URL", "postgresql://clx_query:pw@localhost/clx");

    getQueryPrisma();

    expect(clientOptions).toEqual([
      { datasourceUrl: "postgresql://clx_query:pw@localhost/clx", log: [] },
    ]);
  });

  it("reuses one client", () => {
    vi.stubEnv("QUERY_DATABASE_URL", "postgresql://clx_query:pw@localhost/clx");

    expect(getQueryPrisma()).toBe(getQueryPrisma());
    expect(clientOptions).toHaveLength(1);
  });
});
