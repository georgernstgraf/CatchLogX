"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileInputIcon, RefreshCw, Trash2 } from "lucide-react";
import Sidebar from "./Sidebar";
import DarkModeToggle from "./DarkModeToggle";

/**
 * The caller's own imports (#202). An import commits directly, so there is no
 * review status any more: every row listed here is an import that exists.
 * A deleted import leaves no row behind (#184).
 */
type ImportItem = {
  id: string;
  fileName: string;
  fileHash: string;
  rowCount: number;
  createdAt: string;
  samplings: number;
  userId: string;
  importedByUsername: string;
  importedByName: string | null;
};

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("de-AT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium" }).format(date);
}

function countOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeImportEntry(value: unknown): ImportItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.id !== "string" || candidate.id.trim().length === 0) {
    return null;
  }

  return {
    id: candidate.id,
    fileName:
      typeof candidate.fileName === "string" &&
      candidate.fileName.trim().length > 0
        ? candidate.fileName
        : "Unknown file",
    fileHash: typeof candidate.fileHash === "string" ? candidate.fileHash : "",
    rowCount: countOrZero(candidate.rowCount),
    createdAt:
      typeof candidate.createdAt === "string"
        ? candidate.createdAt
        : new Date().toISOString(),
    samplings: countOrZero(candidate.samplings),
    userId: typeof candidate.userId === "string" ? candidate.userId : "",
    importedByUsername:
      typeof candidate.importedByUsername === "string"
        ? candidate.importedByUsername
        : "",
    importedByName:
      typeof candidate.importedByName === "string"
        ? candidate.importedByName
        : null,
  };
}

function parseImportsFromApiPayload(payload: unknown): ImportItem[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const response = payload as Record<string, unknown>;
  if (!Array.isArray(response.imports)) {
    return [];
  }

  return response.imports
    .map((entry) => normalizeImportEntry(entry))
    .filter((entry): entry is ImportItem => entry !== null);
}

const MyUploadsPageComponent = () => {
  const [imports, setImports] = useState<ImportItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ImportItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const loadImports = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/upload/my", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (response.ok) {
        const payload = await response.json();
        setImports(parseImportsFromApiPayload(payload));
      } else {
        let fallbackMessage = "Your imports could not be loaded.";
        try {
          const payload = await response.json();
          if (typeof payload?.error === "string") {
            fallbackMessage = payload.error;
          }
        } catch {
          // Ignore JSON parsing errors and keep the fallback message.
        }
        setErrorMessage(fallbackMessage);
        setImports([]);
      }
    } catch {
      setErrorMessage("Network error while loading your imports.");
      setImports([]);
    }

    setLastUpdated(new Date());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadImports();
  }, [loadImports]);

  const openDeleteDialog = (item: ImportItem) => {
    setPendingDelete(item);
    setDeleteError("");
  };

  const closeDeleteDialog = () => {
    setPendingDelete(null);
    setDeleteError("");
  };

  const handleDownload = (item: ImportItem) => {
    const anchor = document.createElement("a");
    anchor.href = `/api/upload/my/${item.id}/download`;
    anchor.download = item.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleDelete = async () => {
    if (!pendingDelete || isDeleting) return;

    setIsDeleting(true);
    setDeleteError("");

    try {
      const response = await fetch(`/api/upload/my/${pendingDelete.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const deletedId = pendingDelete.id;
        setImports((current) =>
          current.filter((item) => item.id !== deletedId),
        );
        setPendingDelete(null);
        setLastUpdated(new Date());
        return;
      }

      let message = "The import could not be deleted.";
      try {
        const payload = await response.json();
        if (typeof payload?.error === "string") {
          message = payload.error;
        }
      } catch {
        // Ignore JSON parsing errors and keep the fallback message.
      }
      setDeleteError(message);
    } catch {
      setDeleteError("Network error while deleting the import.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 p-6 md:p-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                My imports
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Files you imported, with the rows they added.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadImports}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#357174] hover:bg-[#2a5a5d] text-white transition-colors"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
              <DarkModeToggle variant="page" />
            </div>
          </div>

          {errorMessage && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mb-6 text-sm text-red-800 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                Loading your imports...
              </div>
            ) : imports.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                <FileInputIcon className="mx-auto mb-3" size={38} />
                <p className="font-medium">
                  You have not imported any files yet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        File
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Rows
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Samplings
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Imported at
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {imports.map((item) => {
                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 break-all">
                            {item.fileName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {item.rowCount}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {item.samplings}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {formatDateTime(item.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center space-x-3">
                              <button
                                onClick={() => handleDownload(item)}
                                className="text-blue-600 hover:text-blue-800 flex items-center"
                                title="Download a copy"
                              >
                                <Download size={16} className="mr-1" />
                                Download
                              </button>
                              <button
                                onClick={() => openDeleteDialog(item)}
                                className="text-red-600 hover:text-red-800 flex items-center"
                                title="Delete import"
                              >
                                <Trash2 size={16} className="mr-1" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {lastUpdated && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
              Last update: {formatDateTime(lastUpdated.toISOString())}
            </p>
          )}
        </div>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">
              Delete this import?
            </h3>

            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <p className="font-medium text-gray-800 dark:text-gray-200 break-all">
                {pendingDelete.fileName} — {pendingDelete.rowCount} rows,
                imported {formatDate(pendingDelete.createdAt)}
              </p>
              <p>
                {pendingDelete.rowCount} catches from{" "}
                {pendingDelete.samplings} samplings will be deleted.
              </p>
              <p>
                The original file and the import record itself will be deleted
                from the database — this cannot be undone.
              </p>
              <p>recapture flags of other imports stay unchanged.</p>
              <p>Analyses that already ran will not be corrected.</p>
            </div>

            {deleteError && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-sm text-red-800 dark:text-red-300">
                {deleteError}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3 mt-6">
              <button
                onClick={() => handleDownload(pendingDelete)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Download a copy
              </button>
              <button
                onClick={closeDeleteDialog}
                disabled={isDeleting}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:bg-gray-400"
              >
                {isDeleting ? "Deleting..." : "Delete import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyUploadsPageComponent;
