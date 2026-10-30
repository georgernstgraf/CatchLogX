import { prisma } from "@/lib/prisma";

/**
 * Seed scripts write fixed ids into autoincrement tables. Explicit ids do not
 * advance a Postgres sequence, so the next insert by the app would be handed a
 * seeded id and fail. Each script that writes fixed ids syncs its own table,
 * because the scripts also run on their own (docker-compose and
 * `wipe-and-seed.ts` run only `insert-fish.ts`).
 */

export type SeededTable =
  | "river_sites"
  | "samplings"
  | "fish_catches"
  | "fish_species";

export interface SequenceState {
  lastValue: number;
  isCalled: boolean;
}

/**
 * The value to pass to `setval`, or null when the sequence's next value is
 * already free. Sequences only ever move forward here: a repeated seed run must
 * not hand out ids again that imports have used.
 */
export function planSequenceSync(
  maxId: number | null,
  sequence: SequenceState,
): number | null {
  const nextValue = sequence.isCalled
    ? sequence.lastValue + 1
    : sequence.lastValue;

  return maxId !== null && nextValue <= maxId ? maxId : null;
}

/** Moves the table's id sequence past its highest id. */
export async function syncSeedSequence(table: SeededTable) {
  const [state] = await prisma.$queryRawUnsafe<
    { maxId: number | null; lastValue: bigint; isCalled: boolean }[]
  >(
    `SELECT (SELECT MAX(id) FROM "${table}") AS "maxId", last_value AS "lastValue", is_called AS "isCalled" FROM "${table}_id_seq"`,
  );

  const value = planSequenceSync(state.maxId, {
    lastValue: Number(state.lastValue),
    isCalled: state.isCalled,
  });

  if (value !== null) {
    await prisma.$executeRawUnsafe(
      `SELECT setval('${table}_id_seq', ${value})`,
    );
  }
}
