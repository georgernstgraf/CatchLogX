import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRawUnsafe: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import {
  SeedGuardError,
  assertSeedAllowed,
  formatTarget,
  seedRefusal,
  type SeedTarget,
} from "./seedGuard";

const EMPTY: SeedTarget = {
  database: "clx",
  serverAddr: "127.0.0.1",
  host: "think",
  fishCatches: 0,
  samplings: 0,
  riverSites: 0,
  fishSpecies: 125,
};

const POPULATED: SeedTarget = {
  ...EMPTY,
  fishCatches: 464_654,
  samplings: 10_497,
  riverSites: 6_260,
};

describe("formatTarget", () => {
  it("names database, server, host and all four row counts", () => {
    const line = formatTarget(POPULATED);

    expect(line).toContain("clx");
    expect(line).toContain("127.0.0.1");
    expect(line).toContain("think");
    expect(line).toContain("464,654");
    expect(line).toContain("10,497");
    expect(line).toContain("6,260");
    expect(line).toContain("125");
  });

  it("survives a unix-socket connection without a server address", () => {
    expect(formatTarget({ ...EMPTY, serverAddr: null })).toContain("socket");
  });
});

describe("seedRefusal", () => {
  it("allows a demo seed on an empty database", () => {
    expect(seedRefusal(EMPTY, { script: "insert-fish.ts" })).toBeNull();
  });

  it("refuses a demo seed once catches exist — no override", () => {
    const refusal = seedRefusal(POPULATED, {
      script: "insert-fish.ts",
      allow: `${POPULATED.host}/${POPULATED.database}`,
    });

    expect(refusal).not.toBeNull();
    expect(refusal).toContain("464,654");
    expect(refusal).toContain("insert-fish.ts");
    // The cutover rule is mechanical: base data is operational data from the
    // first catch on, and no environment variable may bypass it.
    expect(refusal).toContain("DECISIONS.md");
  });

  it("refuses a destructive script without a confirmation", () => {
    const refusal = seedRefusal(EMPTY, {
      script: "wipe-fish.ts",
      destructive: true,
    });

    expect(refusal).not.toBeNull();
    expect(refusal).toContain("ALLOW_DESTRUCTIVE_SEED=think/clx");
  });

  it.each([
    ["1", "the issue's original shorthand"],
    ["clx", "the bare database name"],
    ["other-host/clx", "a value prepared for a different host"],
    ["think/other-db", "a value prepared for a different database"],
  ])("refuses the confirmation %s (%s)", (allow) => {
    const refusal = seedRefusal(POPULATED, {
      script: "wipe-and-seed.ts",
      destructive: true,
      allow,
    });

    expect(refusal).not.toBeNull();
    expect(refusal).toContain("ALLOW_DESTRUCTIVE_SEED=think/clx");
  });

  it("allows a destructive script with the exact host/database confirmation", () => {
    expect(
      seedRefusal(POPULATED, {
        script: "wipe-and-seed.ts",
        destructive: true,
        allow: "think/clx",
      }),
    ).toBeNull();
  });
});

describe("assertSeedAllowed", () => {
  const query = vi.mocked(prisma.$queryRawUnsafe);

  beforeEach(() => {
    query.mockReset();
  });

  const target = (t: SeedTarget) =>
    query.mockResolvedValue([
      {
        database: t.database,
        serverAddr: t.serverAddr,
        fishCatches: t.fishCatches,
        samplings: t.samplings,
        riverSites: t.riverSites,
        fishSpecies: t.fishSpecies,
      },
    ]);

  it("reads the target from the database and passes on an empty database", async () => {
    target(EMPTY);

    await expect(
      assertSeedAllowed({ script: "insert-fish.ts" }),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("throws a SeedGuardError on a populated database", async () => {
    target(POPULATED);

    await expect(
      assertSeedAllowed({ script: "insert-fish.ts" }),
    ).rejects.toBeInstanceOf(SeedGuardError);
  });

  it("accepts the confirmation for the host it actually runs on", async () => {
    target(POPULATED);

    await expect(
      assertSeedAllowed({
        script: "wipe-and-seed.ts",
        destructive: true,
        allow: `${os.hostname()}/clx`,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a confirmation that belongs to another host", async () => {
    target(POPULATED);

    await expect(
      assertSeedAllowed({
        script: "wipe-and-seed.ts",
        destructive: true,
        allow: "claw/clx",
      }),
    ).rejects.toBeInstanceOf(SeedGuardError);
  });
});

describe("every demo script is guarded", () => {
  const demoDir = fileURLToPath(new URL("../scripts/demo", import.meta.url));

  it.each(readdirSync(demoDir).filter((f) => f.endsWith(".ts")))(
    "%s imports the seed guard",
    (file) => {
      const source = readFileSync(`${demoDir}/${file}`, "utf8");

      expect(source).toMatch(/from "@\/lib\/seedGuard"/);
      expect(source).toMatch(/assertSeedAllowed\(/);
    },
  );
});
