import { prisma } from "@/lib/prisma";

// Fish species administration (#201): the species master is editable through
// the admin GUI. Catches reference a species by foreign key, so a rename only
// touches the species row and a delete is refused while catches still use it.

/** A fish species as exposed to API clients. */
export type FishSpeciesRecord = {
  id: number;
  speciesName: string;
  germanName: string | null;
  family: string | null;
  catchCount: number;
};

/** Input for {@link createFishSpecies}. */
export type CreateFishSpeciesInput = {
  speciesName: string;
  germanName?: string | null;
  family?: string | null;
};

/** Input for {@link updateFishSpecies}; omitted fields stay untouched. */
export type UpdateFishSpeciesInput = {
  speciesName?: string;
  germanName?: string | null;
  family?: string | null;
};

/** Result of {@link createFishSpecies}. */
export type CreateFishSpeciesResult = {
  species?: FishSpeciesRecord;
  /** The trimmed species name was empty. */
  invalid?: true;
  /** A species with the same name already exists (P2002). */
  conflict?: true;
};

/** Result of {@link updateFishSpecies}. */
export type UpdateFishSpeciesResult = {
  species?: FishSpeciesRecord;
  /** The trimmed species name was empty. */
  invalid?: true;
  /** The species does not exist (P2025). */
  notFound?: true;
  /** Another species already carries that name (P2002). */
  conflict?: true;
};

/** Result of {@link deleteFishSpecies}. */
export type DeleteFishSpeciesResult = {
  deleted?: true;
  /** The species does not exist (P2025). */
  notFound?: true;
  /** The species is still referenced by catches (pre-check or P2003 race). */
  conflict?: true;
  /** Number of catches using the species, when the pre-check found them. */
  catchCount?: number;
};

/** Columns of a species plus its catch count, as read from the database. */
const fishSpeciesSelect = {
  id: true,
  speciesName: true,
  germanName: true,
  family: true,
  _count: { select: { catches: true } },
} as const;

type FishSpeciesRow = {
  id: number;
  speciesName: string;
  germanName: string | null;
  family: string | null;
  _count: { catches: number };
};

/** Drops the raw relation count from the public shape. */
function flattenSpecies(row: FishSpeciesRow): FishSpeciesRecord {
  const { _count, ...species } = row;
  return { ...species, catchCount: _count.catches };
}

/** True when the error carries the given Prisma error code. */
function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === code
  );
}

/**
 * Collapses U+00A0 and runs of whitespace to single spaces, then trims (#201).
 *
 * A name pasted out of Word or a PDF carries NBSP, which is visually identical
 * to a space — that is how `Silurus glanis` ended up in two spellings (#80).
 * The GUI normalizes too, but a direct API call must not be able to mint the
 * near-duplicate.
 */
function cleanSpeciesName(value: string): string {
  return value.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

/** Lists all species alphabetically, each with the number of catches using it. */
export async function listFishSpecies(): Promise<FishSpeciesRecord[]> {
  const rows = await prisma.fishSpecies.findMany({
    orderBy: { speciesName: "asc" },
    select: fishSpeciesSelect,
  });

  return rows.map(flattenSpecies);
}

/** Creates a species; the scientific name is trimmed and must not be empty. */
export async function createFishSpecies(
  input: CreateFishSpeciesInput,
): Promise<CreateFishSpeciesResult> {
  const speciesName = cleanSpeciesName(input.speciesName);
  if (!speciesName) {
    return { invalid: true };
  }

  try {
    const species = await prisma.fishSpecies.create({
      data: {
        speciesName,
        germanName: input.germanName ?? null,
        family: input.family ?? null,
      },
      select: fishSpeciesSelect,
    });

    return { species: flattenSpecies(species) };
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      return { conflict: true };
    }
    throw error;
  }
}

/**
 * Updates a species. Only the passed fields are written; a rename leaves the
 * catches untouched because they reference the species by id.
 */
export async function updateFishSpecies(
  id: number,
  input: UpdateFishSpeciesInput,
): Promise<UpdateFishSpeciesResult> {
  const data: {
    speciesName?: string;
    germanName?: string | null;
    family?: string | null;
  } = {};

  if (input.speciesName !== undefined) {
    const speciesName = cleanSpeciesName(input.speciesName);
    if (!speciesName) {
      return { invalid: true };
    }
    data.speciesName = speciesName;
  }

  if (input.germanName !== undefined) {
    data.germanName = input.germanName;
  }

  if (input.family !== undefined) {
    data.family = input.family;
  }

  try {
    const species = await prisma.fishSpecies.update({
      where: { id },
      data,
      select: fishSpeciesSelect,
    });

    return { species: flattenSpecies(species) };
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return { notFound: true };
    }
    if (isPrismaError(error, "P2002")) {
      return { conflict: true };
    }
    throw error;
  }
}

/**
 * Deletes a species, but only when no catch uses it. The pre-check returns the
 * count for the GUI; a foreign key violation (a catch inserted in between) is
 * reported as a conflict without a count.
 */
export async function deleteFishSpecies(
  id: number,
): Promise<DeleteFishSpeciesResult> {
  const catchCount = await prisma.fishCatch.count({ where: { speciesId: id } });

  if (catchCount > 0) {
    return { conflict: true, catchCount };
  }

  try {
    await prisma.fishSpecies.delete({ where: { id } });
    return { deleted: true };
  } catch (error) {
    if (isPrismaError(error, "P2003")) {
      return { conflict: true };
    }
    if (isPrismaError(error, "P2025")) {
      return { notFound: true };
    }
    throw error;
  }
}
