// Client-side wrappers for the admin fish species API (#201). The GUI in
// wave 2 calls these; every response is checked against the public shape so a
// changed server contract fails here instead of inside a component.
// Not to be confused with lib/fishSpecies.ts (server-side Artliste merge).

export type FishSpeciesRecord = {
  id: number;
  speciesName: string;
  germanName: string | null;
  family: string | null;
  catchCount: number;
};

/** Input for {@link createFishSpecies}. */
export type FishSpeciesInput = {
  speciesName: string;
  germanName?: string | null;
  family?: string | null;
};

/** Input for {@link updateFishSpecies}; omitted fields stay untouched. */
export type FishSpeciesUpdateInput = {
  speciesName?: string;
  germanName?: string | null;
  family?: string | null;
};

type ApiPayload = {
  fishSpecies?: unknown;
  species?: unknown;
  error?: string;
};

/** Reads the JSON body, tolerating an empty or non-JSON response. */
async function readPayload(response: Response): Promise<ApiPayload> {
  try {
    return (await response.json()) as ApiPayload;
  } catch {
    return {};
  }
}

// Exported for unit tests (see lib/fish-species-client.test.ts, #201).
export function normalizeFishSpecies(value: unknown): FishSpeciesRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  const validOptionalString = (field: unknown) =>
    field === null || typeof field === "string";

  if (
    typeof candidate.id !== "number" ||
    typeof candidate.speciesName !== "string" ||
    !validOptionalString(candidate.germanName) ||
    !validOptionalString(candidate.family) ||
    typeof candidate.catchCount !== "number"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    speciesName: candidate.speciesName,
    germanName: candidate.germanName as string | null,
    family: candidate.family as string | null,
    catchCount: candidate.catchCount,
  };
}

/**
 * Cleans a species name typed by a user: non-breaking spaces become normal
 * spaces, whitespace is collapsed and trimmed, the case is kept (it is a
 * display name). Returns `null` when nothing is left.
 */
export function normalizeSpeciesInput(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

  return normalized.length > 0 ? normalized : null;
}

/** Loads all fish species with their catch counts. */
export async function fetchFishSpecies(): Promise<FishSpeciesRecord[]> {
  const response = await fetch("/api/admin/fish-species", {
    method: "GET",
    cache: "no-store",
  });

  const payload = await readPayload(response);

  if (!response.ok) {
    throw new Error(payload.error || "Fish species could not be loaded.");
  }

  if (!Array.isArray(payload.fishSpecies)) {
    return [];
  }

  return payload.fishSpecies
    .map((entry) => normalizeFishSpecies(entry))
    .filter((entry): entry is FishSpeciesRecord => entry !== null);
}

/** Creates a fish species. */
export async function createFishSpecies(
  input: FishSpeciesInput,
): Promise<FishSpeciesRecord> {
  const response = await fetch("/api/admin/fish-species", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = await readPayload(response);

  if (!response.ok || !payload.species) {
    throw new Error(payload.error || "Fish species could not be created.");
  }

  const normalized = normalizeFishSpecies(payload.species);
  if (!normalized) {
    throw new Error("Invalid fish species payload received from server.");
  }

  return normalized;
}

/** Updates the given fields of a fish species. */
export async function updateFishSpecies(
  id: number,
  input: FishSpeciesUpdateInput,
): Promise<FishSpeciesRecord> {
  const response = await fetch(`/api/admin/fish-species/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = await readPayload(response);

  if (!response.ok || !payload.species) {
    throw new Error(payload.error || "Fish species could not be updated.");
  }

  const normalized = normalizeFishSpecies(payload.species);
  if (!normalized) {
    throw new Error("Invalid fish species payload received from server.");
  }

  return normalized;
}

/**
 * Deletes a fish species. The server message is surfaced verbatim, so the
 * catch count of a 409 reaches the UI.
 */
export async function deleteFishSpecies(id: number): Promise<void> {
  const response = await fetch(`/api/admin/fish-species/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const payload = await readPayload(response);
    throw new Error(payload.error || "Fish species could not be deleted.");
  }
}
