"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createFishSpecies,
  deleteFishSpecies,
  fetchFishSpecies,
  FishSpeciesRecord,
  normalizeSpeciesInput,
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

  const loadSpecies = async () => {
    try {
      const records = await fetchFishSpecies();
      setSpecies(records);
      setErrorMessage("");
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
    setErrorMessage("");
    setDeleteConfirmId(null);
    setEditingId(record.id);
    setEditDraft(draftFromRecord(record));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditDraft(emptyDraft);
  };

  const handleSaveEdit = async (id: number) => {
    const speciesName = normalizeSpeciesInput(editDraft.speciesName);
    if (!speciesName) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

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
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Fish species could not be updated.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setIsDeleting(true);
    setErrorMessage("");

    try {
      await deleteFishSpecies(id);
      setDeleteConfirmId(null);
      await loadSpecies();
    } catch (error) {
      console.error("Could not delete fish species:", error);
      // The server's 409 text names the catch count; show it verbatim.
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Fish species could not be deleted.",
      );
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
            Species with recorded catches cannot be deleted.
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

                return (
                  <tr
                    key={entry.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/60"
                  >
                    <td className="px-4 py-4 text-sm text-gray-900 dark:text-gray-100">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editDraft.speciesName}
                          onChange={(event) =>
                            setEditDraft({
                              ...editDraft,
                              speciesName: event.target.value,
                            })
                          }
                          className={inputClassName}
                        />
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
                      {entry.catchCount}
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
                            onClick={() => setDeleteConfirmId(null)}
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
                              setErrorMessage("");
                              setEditingId(null);
                              setDeleteConfirmId(entry.id);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                            title="Delete species"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
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
