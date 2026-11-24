"use client";

import React, { Fragment, useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createFishSpecies,
  deleteFishSpecies,
  fetchFishSpecies,
  fetchSpeciesImports,
  FishSpeciesRecord,
  normalizeSpeciesInput,
  speciesEditPolicy,
  SpeciesImportRecord,
  updateFishSpecies,
} from "@/lib/fish-species-client";

type SpeciesDraft = {
  speciesName: string;
  germanName: string;
  family: string;
};

const emptyDraft: SpeciesDraft = {
  speciesName: "",
  germanName: "",
  family: "",
};

function draftFromRecord(record: FishSpeciesRecord): SpeciesDraft {
  return {
    speciesName: record.speciesName,
    germanName: record.germanName ?? "",
    family: record.family ?? "",
  };
}

const inputClassName =
  "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200";

const latinNameLockedHint =
  "Scientific name is fixed while catches exist — it is the key of the Excel import.";

/** Import dates are shown in the local format the admin page uses elsewhere. */
function formatImportDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium" }).format(date);
}

const AdminFishSpeciesManager = () => {
  const [species, setSpecies] = useState<FishSpeciesRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [createDraft, setCreateDraft] = useState<SpeciesDraft>(emptyDraft);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<SpeciesDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Update and delete errors belong to the row they happened in (#228).
  const [rowError, setRowError] = useState<{
    id: number;
    message: string;
  } | null>(null);
  // Imports per species (#224): fetched only when the catch count is expanded,
  // then cached until the list is refreshed or a species changes.
  const [expandedSpeciesId, setExpandedSpeciesId] = useState<number | null>(null);
  const [importsBySpecies, setImportsBySpecies] = useState<
    Record<number, SpeciesImportRecord[]>
  >({});
  const [loadingImportsFor, setLoadingImportsFor] = useState<number | null>(null);
  const [importsError, setImportsError] = useState("");

  const loadSpecies = async () => {
    try {
      const records = await fetchFishSpecies();
      setSpecies(records);
      setImportsBySpecies({});
      setExpandedSpeciesId(null);
      setImportsError("");
      setErrorMessage("");
      setRowError(null);
    } catch (error) {
      console.error("Could not load fish species:", error);
      setErrorMessage("Fish species could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    fetchFishSpecies()
      .then((records) => {
        if (!isActive) {
          return;
        }
        setSpecies(records);
        setErrorMessage("");
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }
        console.error("Could not load fish species:", error);
        setErrorMessage("Fish species could not be loaded.");
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const filteredSpecies = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return species;
    }

    return species.filter((entry) =>
      [entry.speciesName, entry.germanName ?? "", entry.family ?? ""].some(
        (value) => value.toLowerCase().includes(needle),
      ),
    );
  }, [species, search]);

  const normalizedNewName = normalizeSpeciesInput(createDraft.speciesName);

  /**
   * Expands or collapses the imports of one species (#224). The list is
   * fetched on first expand and cached; collapsing never refetches.
   */
  const toggleImports = async (entry: FishSpeciesRecord) => {
    if (expandedSpeciesId === entry.id) {
      setExpandedSpeciesId(null);
      return;
    }

    setExpandedSpeciesId(entry.id);
    setImportsError("");

    if (importsBySpecies[entry.id]) {
      return;
    }

    setLoadingImportsFor(entry.id);

    try {
      const imports = await fetchSpeciesImports(entry.id);
      setImportsBySpecies((current) => ({ ...current, [entry.id]: imports }));
    } catch (error) {
      console.error("Could not load the imports of a fish species:", error);
      setImportsError(
        error instanceof Error
          ? error.message
          : "Imports of this species could not be loaded.",
      );
    } finally {
      setLoadingImportsFor(null);
    }
  };

  const handleCreate = async () => {
    const speciesName = normalizeSpeciesInput(createDraft.speciesName);
    if (!speciesName) {
      return;
    }

    setIsCreating(true);
    setErrorMessage("");

    try {
      await createFishSpecies({
        speciesName,
        germanName: normalizeSpeciesInput(createDraft.germanName),
        family: normalizeSpeciesInput(createDraft.family),
      });
      setCreateDraft(emptyDraft);
      await loadSpecies();
    } catch (error) {
      console.error("Could not create fish species:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Fish species could not be created.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const startEditing = (record: FishSpeciesRecord) => {
    setRowError(null);
    setDeleteConfirmId(null);
    setEditingId(record.id);
    setEditDraft(draftFromRecord(record));
  };

  const cancelEditing = () => {
    setRowError(null);
    setEditingId(null);
    setEditDraft(emptyDraft);
  };

  const handleSaveEdit = async (id: number) => {
    const speciesName = normalizeSpeciesInput(editDraft.speciesName);
    if (!speciesName) {
      return;
    }

    setIsSaving(true);
    setRowError(null);

    try {
      await updateFishSpecies(id, {
        speciesName,
        germanName: normalizeSpeciesInput(editDraft.germanName),
        family: normalizeSpeciesInput(editDraft.family),
      });
      cancelEditing();
      await loadSpecies();
    } catch (error) {
      console.error("Could not update fish species:", error);
      setRowError({
        id,
        message:
          error instanceof Error
            ? error.message
            : "Fish species could not be updated.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setIsDeleting(true);
    setRowError(null);

    try {
      await deleteFishSpecies(id);
      setDeleteConfirmId(null);
      await loadSpecies();
    } catch (error) {
      console.error("Could not delete fish species:", error);
      // The server's 409 text names the catch count; show it verbatim.
      setRowError({
        id,
        message:
          error instanceof Error
            ? error.message
            : "Fish species could not be deleted.",
      });
      setDeleteConfirmId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">
            Fish Species
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Species with recorded catches cannot be deleted, and their scientific
            name is fixed.
          </p>
        </div>
        <div className="rounded-lg bg-[#e8f3f3] dark:bg-[#1f2f3e] border border-[#c7e0e0] dark:border-[#2d4257] px-4 py-2 text-sm text-[#235457] dark:text-[#b8d6d8]">
          Species: <strong>{species.length}</strong>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="text"
            value={createDraft.speciesName}
            onChange={(event) =>
              setCreateDraft({ ...createDraft, speciesName: event.target.value })
            }
            placeholder="Species name (required)"
            className={inputClassName}
          />
          <input
            type="text"
            value={createDraft.germanName}
            onChange={(event) =>
              setCreateDraft({ ...createDraft, germanName: event.target.value })
            }
            placeholder="German name (optional)"
            className={inputClassName}
          />
          <input
            type="text"
            value={createDraft.family}
            onChange={(event) =>
              setCreateDraft({ ...createDraft, family: event.target.value })
            }
            placeholder="Family (optional)"
            className={inputClassName}
          />
          <button
            onClick={handleCreate}
            disabled={!normalizedNewName || isCreating}
            className={`px-4 py-2 rounded-lg text-white transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap ${
              !normalizedNewName || isCreating
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-[#357174] hover:bg-[#2a5a5d]"
            }`}
          >
            <Plus size={16} />
            {isCreating ? "Creating..." : "Add Species"}
          </button>
        </div>
        {errorMessage && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-3">
            {errorMessage}
          </p>
        )}
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, German name, or family"
          className={`${inputClassName} sm:max-w-md`}
        />
        <button
          onClick={loadSpecies}
          className="px-4 py-2 bg-[#357174] text-white rounded hover:bg-[#2a5a5d] transition-colors"
        >
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          Loading fish species...
        </div>
      ) : species.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          No fish species found.
        </div>
      ) : filteredSpecies.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          No fish species match the current search.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  German Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Family
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Catches
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredSpecies.map((entry) => {
                const isEditing = editingId === entry.id;
                const isConfirmingDelete = deleteConfirmId === entry.id;
                const isExpanded = expandedSpeciesId === entry.id;
                const speciesImports = importsBySpecies[entry.id];
                const policy = speciesEditPolicy(entry);
                const nameHintId = `species-name-hint-${entry.id}`;
                const deleteHintId = `species-delete-hint-${entry.id}`;

                return (
                  <Fragment key={entry.id}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/60">
                      <td className="px-4 py-4 text-sm text-gray-900 dark:text-gray-100">
                        {isEditing ? (
                          <>
                            <input
                              type="text"
                              value={editDraft.speciesName}
                              onChange={(event) =>
                                setEditDraft({
                                  ...editDraft,
                                  speciesName: event.target.value,
                                })
                              }
                              disabled={policy.latinNameLocked}
                              aria-describedby={
                                policy.latinNameLocked ? nameHintId : undefined
                              }
                              className={`${inputClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                            />
                            {policy.latinNameLocked && (
                              <p
                                id={nameHintId}
                                className="mt-1 text-xs text-gray-500 dark:text-gray-400"
                              >
                                {latinNameLockedHint}
                              </p>
                            )}
                          </>
                        ) : (
                          entry.speciesName
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDraft.germanName}
                            onChange={(event) =>
                              setEditDraft({
                                ...editDraft,
                                germanName: event.target.value,
                              })
                            }
                            className={inputClassName}
                          />
                        ) : (
                          (entry.germanName ?? "—")
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDraft.family}
                            onChange={(event) =>
                              setEditDraft({
                                ...editDraft,
                                family: event.target.value,
                              })
                            }
                            className={inputClassName}
                          />
                        ) : (
                          (entry.family ?? "—")
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {entry.catchCount > 0 ? (
                          <button
                            onClick={() => toggleImports(entry)}
                            aria-expanded={isExpanded}
                            title="Show imports having this species"
                            className="inline-block min-w-[2.75rem] text-left text-sm text-[#357174] underline underline-offset-2 transition-[font-size] duration-150 hover:text-[1.1375rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#357174] dark:text-[#8fc3c5]"
                          >
                            {entry.catchCount}
                          </button>
                        ) : (
                          entry.catchCount
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSaveEdit(entry.id)}
                              disabled={
                                !normalizeSpeciesInput(editDraft.speciesName) ||
                                isSaving
                              }
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded text-white transition-colors ${
                                !normalizeSpeciesInput(editDraft.speciesName) ||
                                isSaving
                                  ? "bg-gray-400 cursor-not-allowed"
                                  : "bg-[#357174] hover:bg-[#2a5a5d]"
                              }`}
                              title="Save changes"
                            >
                              <Check size={14} />
                              Save
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              title="Cancel editing"
                            >
                              <X size={14} />
                              Cancel
                            </button>
                          </div>
                        ) : isConfirmingDelete ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDelete(entry.id)}
                              disabled={isDeleting}
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded text-white transition-colors ${
                                isDeleting
                                  ? "bg-gray-400 cursor-not-allowed"
                                  : "bg-red-600 hover:bg-red-700"
                              }`}
                              title="Confirm deletion"
                            >
                              <Trash2 size={14} />
                              {isDeleting ? "Deleting..." : "Confirm"}
                            </button>
                            <button
                              onClick={() => {
                                setRowError(null);
                                setDeleteConfirmId(null);
                              }}
                              disabled={isDeleting}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              title="Keep species"
                            >
                              <X size={14} />
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startEditing(entry)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                              title="Edit species"
                            >
                              <Pencil size={14} />
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                setRowError(null);
                                setEditingId(null);
                                setDeleteConfirmId(entry.id);
                              }}
                              disabled={!policy.canDelete}
                              aria-describedby={
                                policy.deleteBlocker ? deleteHintId : undefined
                              }
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded text-white transition-colors ${
                                policy.canDelete
                                  ? "bg-red-600 hover:bg-red-700"
                                  : "bg-gray-400 cursor-not-allowed"
                              }`}
                              title={policy.deleteBlocker ?? "Delete species"}
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                            {policy.deleteBlocker && (
                              <span id={deleteHintId} className="sr-only">
                                {policy.deleteBlocker}
                              </span>
                            )}
                          </div>
                        )}
                        {rowError?.id === entry.id && (
                          <p
                            role="alert"
                            className="mt-2 text-sm text-red-600 dark:text-red-400"
                          >
                            {rowError.message}
                          </p>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50 dark:bg-gray-900/40">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="pl-6">
                            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              Imports having this species
                            </p>
                            {loadingImportsFor === entry.id ? (
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                Loading imports...
                              </p>
                            ) : importsError ? (
                              <p className="text-sm text-red-600 dark:text-red-400">
                                {importsError}
                              </p>
                            ) : !speciesImports || speciesImports.length === 0 ? (
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                No imports.
                              </p>
                            ) : (
                              <ul className="space-y-1">
                                {speciesImports.map((item) => (
                                  <li
                                    key={item.id}
                                    className="text-sm text-gray-700 dark:text-gray-300"
                                  >
                                    <span className="font-medium">
                                      {item.fileName}
                                    </span>{" "}
                                    <span className="text-gray-500 dark:text-gray-400">
                                      (
                                      {item.importedByName ??
                                        item.importedByUsername}
                                      )
                                    </span>{" "}
                                    <span className="text-xs text-gray-400 dark:text-gray-500">
                                      — {formatImportDate(item.createdAt)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminFishSpeciesManager;
