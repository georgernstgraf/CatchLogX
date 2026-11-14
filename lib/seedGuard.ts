import os from "node:os";
import { prisma } from "@/lib/prisma";

/**
 * The seed guard (#198). Demo seeds write base data (`fish_species`,
 * `river_sites`) with fixed ids; wipe scripts delete whole tables. Both are
 * only safe on a database that holds no research data yet.
 *
 * The rule is mechanical and data-driven, not date-driven: from the first
 * catch on, base data is operational data and no seed script may touch it
 * ("Basisdaten-Cutover", docs/ai/DECISIONS.md). The cutover happened for
 * production on 2026-10-17 and for every database restored from a production
 * backup — the dev instance is a production clone since 2026-11-10 (#188).
 *
 * The guard cannot tell production from a clone: both are called `clx` and
 * both are reached over loopback. It makes an accident impossible, not a
 * deliberate act — that is why destructive scripts must repeat the target.
 */

export class SeedGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedGuardError";
  }
}

export interface SeedTarget {
  /** `current_database()` */
  database: string;
  /** `inet_server_addr()`; null on a unix-socket connection */
  serverAddr: string | null;
  /** hostname of the machine running the script */
  host: string;
  fishCatches: number;
  samplings: number;
  riverSites: number;
  fishSpecies: number;
}

export interface SeedOptions {
  /** File name of the calling script, used in the message. */
  script: string;
  /** Wipe scripts delete rows — they always need the confirmation. */
  destructive?: boolean;
  /** Defaults to `process.env.ALLOW_DESTRUCTIVE_SEED`. */
  allow?: string;
}

const count = (n: number) => n.toLocaleString("en-US");

export function formatTarget(target: SeedTarget): string {
  const server = target.serverAddr ?? "unix socket";

  return (
    `${target.database} @ ${server} via ${target.host} — ` +
    `${count(target.fishCatches)} fish catches, ${count(target.samplings)} samplings, ` +
    `${count(target.riverSites)} river sites, ${count(target.fishSpecies)} species`
  );
}

/** The value a destructive run has to repeat: `<host>/<database>`. */
export function confirmationFor(target: SeedTarget): string {
  return `${target.host}/${target.database}`;
}

/**
 * Decides whether a script may run. Returns null when it may, otherwise the
 * refusal text. Pure — no I/O — so the decision is testable without a database.
 */
export function seedRefusal(
  target: SeedTarget,
  opts: SeedOptions,
): string | null {
  if (opts.destructive) {
    const allow = opts.allow ?? process.env.ALLOW_DESTRUCTIVE_SEED;
    const expected = confirmationFor(target);

    if (allow !== expected) {
      return [
        `Refusing to wipe: ${opts.script} deletes data and cannot be undone.`,
        `Set ALLOW_DESTRUCTIVE_SEED=${expected} to confirm you mean this database.`,
        `The value is <host>/<database> on purpose: a confirmation prepared for another database does not unlock this one.`,
      ].join("\n");
    }

    return null;
  }

  if (target.fishCatches > 0) {
    return [
      `Refusing to seed: ${target.database} on ${target.host} already contains ${count(target.fishCatches)} fish catches.`,
      `Base data (fish_species, river_sites) is operational data from the first catch on — see "Basisdaten-Cutover" in docs/ai/DECISIONS.md.`,
      `Change base data through the admin GUI or a versioned data migration, never with ${opts.script}.`,
    ].join("\n");
  }

  return null;
}

async function readTarget(): Promise<SeedTarget> {
  const [row] = await prisma.$queryRawUnsafe<
    {
      database: string;
      serverAddr: string | null;
      fishCatches: number;
      samplings: number;
      riverSites: number;
      fishSpecies: number;
    }[]
  >(
    `SELECT current_database() AS "database",
            inet_server_addr()::text AS "serverAddr",
            (SELECT count(*)::int FROM fish_catches) AS "fishCatches",
            (SELECT count(*)::int FROM samplings) AS "samplings",
            (SELECT count(*)::int FROM river_sites) AS "riverSites",
            (SELECT count(*)::int FROM fish_species) AS "fishSpecies"`,
  );

  return { ...row, host: os.hostname() };
}

/**
 * Reads the target, prints it (so every log line says which database was hit)
 * and throws a SeedGuardError when the script must not run.
 */
export async function assertSeedAllowed(opts: SeedOptions): Promise<void> {
  const target = await readTarget();

  console.log(`seed target: ${formatTarget(target)}`);

  const refusal = seedRefusal(target, opts);
  if (refusal) throw new SeedGuardError(refusal);
}
