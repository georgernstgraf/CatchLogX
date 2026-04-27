"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  FileInputIcon,
  RefreshCw,
  XCircle,
} from "lucide-react";
import Sidebar from "./Sidebar";
import DarkModeToggle from "./DarkModeToggle";

type UploadState =
  | "UPLOADED"
  | "ACCEPTED"
  | "REJECTED"
  | "DB_ERROR"
  | "SAVED_IN_DB";

type UploadItem = {
  id: string;
  link: string;
  state: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type StatusFilter = "ALL" | UploadState;
const STATE_ORDER: UploadState[] = [
  "UPLOADED",
  "ACCEPTED",
  "SAVED_IN_DB",
  "REJECTED",
  "DB_ERROR",
];

function normalizeUploadEntry(value: unknown): UploadItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  const id =
    typeof candidate.id === "string" && candidate.id.trim().length > 0
      ? candidate.id
      : `local-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const link =
    typeof candidate.link === "string" && candidate.link.trim().length > 0
      ? candidate.link
      : "Unknown file";

  const state =
    typeof candidate.state === "string" && candidate.state.trim().length > 0
      ? candidate.state
      : "UPLOADED";

  const createdAt =
    typeof candidate.createdAt === "string" &&
    candidate.createdAt.trim().length > 0
      ? candidate.createdAt
      : new Date().toISOString();

  const updatedAt =
    typeof candidate.updatedAt === "string" &&
    candidate.updatedAt.trim().length > 0
      ? candidate.updatedAt
      : createdAt;

  const note = typeof candidate.note === "string" ? candidate.note : null;

  return {
    id,
    link,
    state,
    note,
    createdAt,
    updatedAt,
  };
}

function parseUploadsFromApiPayload(payload: unknown): UploadItem[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const response = payload as Record<string, unknown>;
  const possibleList = response.uploads ?? response.data ?? payload;

  if (!Array.isArray(possibleList)) {
    return [];
  }

  return possibleList
    .map((entry) => normalizeUploadEntry(entry))
    .filter((entry): entry is UploadItem => entry !== null);
}

function sortUploads(apiUploads: UploadItem[]): UploadItem[] {
  return [...apiUploads].sort((a, b) => {
    const aDate = new Date(a.createdAt).getTime();
    const bDate = new Date(b.createdAt).getTime();
    return bDate - aDate;
  });
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("de-AT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusMeta(state: string): {
  label: string;
  hint: string;
  badgeClass: string;
  icon: React.ComponentType<{ className?: string }>;
} {
  switch (state) {
    case "UPLOADED":
      return {
        label: "In Review",
        hint: "Upload was submitted and is waiting for review.",
        badgeClass:
          "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
        icon: Clock3,
      };
    case "ACCEPTED":
      return {
        label: "Approved",
        hint: "Upload was approved and is being processed.",
        badgeClass:
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
        icon: CheckCircle2,
      };
    case "SAVED_IN_DB":
      return {
        label: "Imported",
        hint: "Data was imported into the database successfully.",
        badgeClass:
          "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
        icon: Database,
      };
    case "REJECTED":
      return {
        label: "Rejected",
        hint: "Upload was rejected. See details in note.",
        badgeClass:
          "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
        icon: XCircle,
      };
    case "DB_ERROR":
      return {
        label: "Error",
        hint: "A technical error occurred during import.",
        badgeClass:
          "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
        icon: AlertTriangle,
      };
    default:
      return {
        label: "Unbekannt",
        hint: "Status konnte nicht zugeordnet werden.",
        badgeClass:
          "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
        icon: AlertTriangle,
      };
  }
}

const MyUploadsPageComponent = () => {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("ALL");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadUploads = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    let apiUploads: UploadItem[] = [];

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
        apiUploads = parseUploadsFromApiPayload(payload);
      } else if (response.status !== 404 && response.status !== 405) {
        let fallbackMessage = "Status could not be loaded.";
        try {
          const payload = await response.json();
          if (typeof payload?.error === "string") {
            fallbackMessage = payload.error;
          }
        } catch {
          // Ignore JSON parsing errors and keep fallback message.
        }
        setErrorMessage(fallbackMessage);
      }
    } catch {
      setErrorMessage("Network error while loading upload statuses.");
    }

    setUploads(sortUploads(apiUploads));
    setLastUpdated(new Date());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadUploads();
  }, [loadUploads]);

  const counts = useMemo(() => {
    const initial = {
      ALL: uploads.length,
      UPLOADED: 0,
      ACCEPTED: 0,
      SAVED_IN_DB: 0,
      REJECTED: 0,
      DB_ERROR: 0,
    };

    for (const upload of uploads) {
      if (upload.state in initial) {
        const key = upload.state as UploadState;
        initial[key] += 1;
      }
    }

    return initial;
  }, [uploads]);

  const filteredUploads = useMemo(() => {
    if (activeFilter === "ALL") {
      return uploads;
    }

    return uploads.filter((upload) => upload.state === activeFilter);
  }, [activeFilter, uploads]);

  const filterButtons: { key: StatusFilter; label: string; count: number }[] = [
    { key: "ALL", label: "All", count: counts.ALL },
    { key: "UPLOADED", label: "In Review", count: counts.UPLOADED },
    { key: "ACCEPTED", label: "Approved", count: counts.ACCEPTED },
    { key: "REJECTED", label: "Rejected", count: counts.REJECTED },
    { key: "DB_ERROR", label: "Error", count: counts.DB_ERROR },
    { key: "SAVED_IN_DB", label: "Imported", count: counts.SAVED_IN_DB },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 p-6 md:p-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                My Uploads
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadUploads}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#357174] hover:bg-[#2a5a5d] text-white transition-colors"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
              <DarkModeToggle variant="page" />
            </div>
          </div>

          <div className="bg-[#e8f3f3] dark:bg-[#1f2f3e] border border-[#c7e0e0] dark:border-[#2d4257] rounded-lg px-4 py-3 mb-6 text-sm text-[#235457] dark:text-[#b8d6d8]">
            <strong>Status Logic:</strong> In Review → Approved → Imported or
            Rejected/Error.
          </div>

          {errorMessage && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mb-6 text-sm text-red-800 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
            {STATE_ORDER.map((state) => {
              const meta = statusMeta(state);
              const Icon = meta.icon;

              return (
                <div
                  key={state}
                  className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {meta.label}
                    </p>
                    <Icon className="h-4 w-4 text-gray-400" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {counts[state]}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {filterButtons.map((filter) => (
              <button
                key={filter.key}
                onClick={() => setActiveFilter(filter.key)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  activeFilter === filter.key
                    ? "bg-[#357174] text-white border-[#357174]"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-[#357174]"
                }`}
              >
                {filter.label} ({filter.count})
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                Loading upload statuses...
              </div>
            ) : filteredUploads.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                <FileInputIcon className="mx-auto mb-3" size={38} />
                <p className="font-medium">No uploads found yet.</p>
                <p className="text-sm mt-1">
                  Submit a file first. It will appear here with its current
                  status.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredUploads.map((upload) => {
                  const meta = statusMeta(upload.state);
                  const Icon = meta.icon;

                  return (
                    <div
                      key={upload.id}
                      className="p-4 md:p-5 hover:bg-gray-50 dark:hover:bg-gray-750/30 transition-colors"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-gray-900 dark:text-gray-100 break-all">
                            {upload.link}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-all">
                            Upload ID: {upload.id}
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-600 dark:text-gray-400">
                            <span>Created: {formatDate(upload.createdAt)}</span>
                            <span>Updated: {formatDate(upload.updatedAt)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-start lg:items-end gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.badgeClass}`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {meta.label}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {meta.hint}
                          </span>
                        </div>
                      </div>

                      {(upload.state === "REJECTED" ||
                        upload.state === "DB_ERROR") &&
                        upload.note && (
                          <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
                            <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300 font-semibold">
                              Note
                            </p>
                            <p className="text-sm text-amber-800 dark:text-amber-200 mt-1 whitespace-pre-wrap">
                              {upload.note}
                            </p>
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {lastUpdated && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
              Last Update: {formatDate(lastUpdated.toISOString())}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyUploadsPageComponent;
