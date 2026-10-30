import { beforeEach, describe, expect, it, vi } from "vitest";

// Seed scripts write fixed ids into autoincrement tables, which leaves the
// Postgres sequences behind and makes the next app insert collide with the
// seed rows. Prisma is mocked: real sequence behaviour needs a database.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { planSequenceSync, syncSeedSequence } from "@/lib/seedSequences";

describe("planSequenceSync", () => {
  it("moves an untouched sequence past the seeded ids", () => {
    expect(planSequenceSync(10, { lastValue: 1, isCalled: false })).toBe(10);
  });

  it("moves a sequence that failed imports advanced only partway", () => {
    expect(planSequenceSync(10, { lastValue: 3, isCalled: true })).toBe(10);
  });

  it("moves a sequence whose next value would be the highest id", () => {
    expect(planSequenceSync(10, { lastValue: 10, isCalled: false })).toBe(10);
  });

  it("leaves the sequence alone on a second seed run", () => {
    expect(planSequenceSync(10, { lastValue: 10, isCalled: true })).toBeNull();
  });

  it("never moves a sequence back that imports already advanced", () => {
    expect(planSequenceSync(10, { lastValue: 29, isCalled: true })).toBeNull();
  });

  it("leaves the sequence alone when the table is empty", () => {
    expect(planSequenceSync(null, { lastValue: 1, isCalled: false })).toBeNull();
  });
});

describe("syncSeedSequence", () => {
  beforeEach(() => {
    vi.mocked(prisma.$queryRawUnsafe).mockReset();
    vi.mocked(prisma.$executeRawUnsafe).mockReset();
  });

  it("sets the table's sequence to its highest id", async () => {
    // Postgres returns the sequence's bigint columns as BigInt.
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      { maxId: 50, lastValue: BigInt(1), isCalled: false },
    ]);

    await syncSeedSequence("fish_catches");

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledExactlyOnceWith(
      "SELECT setval('fish_catches_id_seq', 50)",
    );
  });

  it("writes nothing when the sequence is already past the highest id", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      { maxId: 50, lastValue: BigInt(50), isCalled: true },
    ]);

    await syncSeedSequence("fish_catches");

    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
