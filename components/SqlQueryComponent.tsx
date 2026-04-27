"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import DarkModeToggle from "./DarkModeToggle";

interface Location {
  lat: number;
  lon: number;
  label: string;
}

interface PresetQuery {
  id: string;
  label: string;
  description: string;
  query: string;
  hasParameter?: boolean;
  parameterLabel?: string;
  parameterPlaceholder?: string;
}

interface SavedQuery {
  id: string;
  name: string;
  query: string;
  createdAt: string;
  updatedAt: string;
}

// Preset queries
const presetQueries: PresetQuery[] = [
  {
    id: "custom",
    label: "Custom Query",
    description: "Write your own SQL query",
    query: "SELECT * FROM fish_species;",
  },
  {
    id: "species_rivers",
    label: "Species by River/Sampling Site",
    description:
      "Shows which fish species occur in which rivers/sampling sites",
    query: `SELECT DISTINCT
  fs."speciesName" AS "Fish Species",
  fs."germanName" AS "German Name",
  rs."riverName" AS "River",
  rs."siteName" AS "Sampling Site",
  rs."siteCode" AS "Site Code"
FROM fish_catches fc
JOIN fish_species fs ON fc."speciesId" = fs.id
JOIN samplings s ON fc."samplingId" = s.id
JOIN river_sites rs ON s."siteId" = rs.id
ORDER BY rs."riverName", fs."speciesName";`,
  },
  {
    id: "species_by_site",
    label: "Species at River/Sampling Site",
    description:
      "Lists all species that occur at a specific river or sampling site",
    query: `SELECT DISTINCT
  fs."speciesName" AS "Fish Species",
  fs."germanName" AS "German Name",
  fs."latinName" AS "Latin Name",
  fs."family" AS "Family",
  COUNT(fc.id) AS "Catch Count"
FROM fish_catches fc
JOIN fish_species fs ON fc."speciesId" = fs.id
JOIN samplings s ON fc."samplingId" = s.id
JOIN river_sites rs ON s."siteId" = rs.id
WHERE rs."riverName" ILIKE '%{{PARAMETER}}%' OR rs."siteName" ILIKE '%{{PARAMETER}}%'
GROUP BY fs.id, fs."speciesName", fs."germanName", fs."latinName", fs."family"
ORDER BY "Catch Count" DESC;`,
    hasParameter: true,
    parameterLabel: "River or Site Name",
    parameterPlaceholder: "e.g. Danube, Mur, ...",
  },
  {
    id: "samplings_by_river",
    label: "Sampling Events by River",
    description:
      "Lists all sampling events for a river with coordinates, elevation, and date",
    query: `SELECT
  s.id AS "Sampling ID",
  rs."riverName" AS "River",
  rs."siteName" AS "Sampling Site",
  rs."siteCode" AS "Site Code",
  rs.latitude AS "latitude",
  rs.longitude AS "longitude",
  s."catchDate" AS "Date",
  s.year AS "Year",
  s.method AS "Method",
  s."dataProvider" AS "Data Source",
  s.project AS "Project"
FROM samplings s
JOIN river_sites rs ON s."siteId" = rs.id
WHERE rs."riverName" ILIKE '%{{PARAMETER}}%'
ORDER BY s."catchDate" DESC NULLS LAST, s.year DESC;`,
    hasParameter: true,
    parameterLabel: "River Name",
    parameterPlaceholder: "e.g. Danube, Mur, ...",
  },
  {
    id: "catches_by_sampling",
    label: "Catches for a Sampling Event",
    description:
      "Shows all caught species with count and length for a specific sampling event",
    query: `SELECT
  fs."speciesName" AS "Fish Species",
  fs."germanName" AS "German Name",
  COUNT(fc.id) AS "Count",
  ROUND(AVG(fc."lengthMm")::numeric, 1) AS "Avg Length (mm)",
  MIN(fc."lengthMm") AS "Min Length (mm)",
  MAX(fc."lengthMm") AS "Max Length (mm)",
  ROUND(AVG(fc."totalWeightGr")::numeric, 1) AS "Avg Weight (g)"
FROM fish_catches fc
JOIN fish_species fs ON fc."speciesId" = fs.id
WHERE fc."samplingId" = {{PARAMETER}}
GROUP BY fs.id, fs."speciesName", fs."germanName"
ORDER BY "Count" DESC;`,
    hasParameter: true,
    parameterLabel: "Sampling ID",
    parameterPlaceholder: "e.g. 1, 2, 3, ...",
  },
  {
    id: "all_samplings",
    label: "All Sampling Events (with Coordinates)",
    description: "Overview of all sampling events with location information",
    query: `SELECT
  s.id AS "Sampling ID",
  rs."riverName" AS "River",
  rs."siteName" AS "Sampling Site",
  rs.latitude AS "latitude",
  rs.longitude AS "longitude",
  s."catchDate" AS "Date",
  s.year AS "Year",
  COUNT(fc.id) AS "Catch Count"
FROM samplings s
JOIN river_sites rs ON s."siteId" = rs.id
LEFT JOIN fish_catches fc ON fc."samplingId" = s.id
GROUP BY s.id, rs."riverName", rs."siteName", rs.latitude, rs.longitude, s."catchDate", s.year
ORDER BY s.year DESC, s."catchDate" DESC NULLS LAST;`,
  },
  {
    id: "fish_by_pit",
    label: "Catches of a PIT number",
    description: "All catches of a fish with a specific PIT-Tag-Number",
    query: `SELECT
  fc.id AS "Catch ID",
  fc."pitDec" AS "PIT DEC",
  fc."pitHex" AS "PIT HEX",
  fc."recapture" AS "Recapture",
  fs."speciesName" AS "Species",
  fs."germanName" AS "German Name",
  s."catchDate" AS "Date",
  rs."riverName" AS "River",
  rs."siteName" AS "Location",
  fc."lengthMm" AS "Length (mm)",
  fc."totalWeightGr" AS "Mass (g)"
FROM fish_catches fc
JOIN fish_species fs ON fc."speciesId" = fs.id
JOIN samplings s ON fc."samplingId" = s.id
JOIN river_sites rs ON s."siteId" = rs.id
WHERE fc."pitDec" = '{{PARAMETER}}'
ORDER BY s."catchDate" DESC;`,
    hasParameter: true,
    parameterLabel: "PIT DEC Number",
    parameterPlaceholder: "z.B. 3D9F.123456789",
  },
];

// Dynamically import MapContainer to avoid SSR issues with Leaflet
const MapComponent = dynamic<{ locations: Location[] }>(
  () => import("./MapComponent"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] w-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Map is loading ...
        </span>
      </div>
    ),
  },
);

const SqlQueryUIDesign: React.FC = () => {
  const defaultQuery = presetQueries[0].query;
  const [query, setQuery] = useState<string>(defaultQuery);
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>("custom");
  const [parameter, setParameter] = useState<string>("");
  const [selectedSamplingId, setSelectedSamplingId] = useState<number | null>(
    null,
  );
  const [samplingDetails, setSamplingDetails] = useState<
    Record<string, unknown>[]
  >([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

  // Toast state
  const [toast, setToast] = useState<{
    message: string;
    type: "error" | "success";
  } | null>(null);
  const toastTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string, type: "error" | "success" = "error") => {
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
      setToast({ message, type });
      toastTimeout.current = setTimeout(() => setToast(null), 3500);
    },
    [],
  );

  // Saved queries state
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveQueryName, setSaveQueryName] = useState("");
  const [editingQueryId, setEditingQueryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState<SavedQuery | null>(null);
  const [previewQuery, setPreviewQuery] = useState<SavedQuery | null>(null);

  const fetchSavedQueries = useCallback(async () => {
    try {
      const res = await fetch("/api/query/save");
      if (res.ok) {
        const data = await res.json();
        setSavedQueries(data.data || []);
      }
    } catch (err) {
      console.error("Fehler beim Laden der gespeicherten Queries:", err);
    }
  }, []);

  useEffect(() => {
    fetchSavedQueries();
  }, [fetchSavedQueries]);

  const handleSaveQuery = useCallback(async () => {
    const trimmed = saveQueryName.trim();
    if (!trimmed || !query.trim() || isSaving) return;

    // Duplikat-Check: gleicher Name existiert bereits
    const duplicateName = savedQueries.find(
      (sq) => sq.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicateName) {
      showToast("A query with this name already exists.", "error");
      return;
    }

    // Duplikat-Check: gleicher Query-Text existiert bereits
    const duplicateQuery = savedQueries.find(
      (sq) => sq.query.trim() === query.trim(),
    );
    if (duplicateQuery) {
      showToast(
        `This query is already saved under the name "${duplicateQuery.name}".`,
        "error",
      );
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/query/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, query }),
      });
      if (res.ok) {
        await fetchSavedQueries();
        setSaveQueryName("");
        setShowSaveDialog(false);
        showToast("Query saved successfully.", "success");
      }
    } catch (err) {
      console.error("Fehler beim Speichern:", err);
      showToast("Error while saving the query.", "error");
    } finally {
      setIsSaving(false);
    }
  }, [
    saveQueryName,
    query,
    isSaving,
    fetchSavedQueries,
    savedQueries,
    showToast,
  ]);

  const handleLoadSavedQuery = useCallback(
    (sq: SavedQuery) => {
      // Wenn im Editor bereits etwas steht, Warnung zeigen
      if (query.trim() && query !== presetQueries[0].query) {
        setConfirmLoad(sq);
        return;
      }
      setQuery(sq.query);
      setSelectedPreset("custom");
      setParameter("");
      setSelectedSamplingId(null);
      setSamplingDetails([]);
    },
    [query],
  );

  const confirmLoadQuery = useCallback(() => {
    if (!confirmLoad) return;
    setQuery(confirmLoad.query);
    setSelectedPreset("custom");
    setParameter("");
    setSelectedSamplingId(null);
    setSamplingDetails([]);
    setConfirmLoad(null);
  }, [confirmLoad]);

  const handleRenameSavedQuery = useCallback(
    async (id: string) => {
      const trimmed = editingName.trim();
      if (!trimmed) return;
      try {
        const res = await fetch("/api/query/save", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, name: trimmed }),
        });
        if (res.ok) {
          await fetchSavedQueries();
          setEditingQueryId(null);
          setEditingName("");
        }
      } catch (err) {
        console.error("Fehler beim Umbenennen:", err);
      }
    },
    [editingName, fetchSavedQueries],
  );

  const handleDeleteSavedQuery = useCallback(
    async (id: string) => {
      try {
        const res = await fetch("/api/query/save", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (res.ok) {
          await fetchSavedQueries();
        }
      } catch (err) {
        console.error("Fehler beim Löschen:", err);
      }
    },
    [fetchSavedQueries],
  );

  const currentPreset = presetQueries.find((p) => p.id === selectedPreset);

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = presetQueries.find((p) => p.id === presetId);
    if (preset) {
      setQuery(preset.query);
      setParameter("");
      setSelectedSamplingId(null);
      setSamplingDetails([]);
    }
  };

  const getExecutableQuery = useCallback(() => {
    if (currentPreset?.hasParameter && parameter) {
      return query.replace(/\{\{PARAMETER\}\}/g, parameter);
    }
    return query;
  }, [currentPreset, parameter, query]);

  // Handler für Klick auf eine Befischungszeile
  const handleSamplingClick = async (samplingId: number) => {
    if (selectedSamplingId === samplingId) {
      // Toggle off wenn bereits ausgewählt
      setSelectedSamplingId(null);
      setSamplingDetails([]);
      return;
    }

    setSelectedSamplingId(samplingId);
    setIsLoadingDetails(true);

    const detailQuery = `SELECT
  fs."speciesName" AS "Fish Species",
  fs."germanName" AS "German Name",
  COUNT(fc.id) AS "Count",
  ROUND(AVG(fc."lengthMm")::numeric, 1) AS "Ø Länge (mm)",
  MIN(fc."lengthMm") AS "Min Length (mm)",
  MAX(fc."lengthMm") AS "Max Length (mm)",
  ROUND(AVG(fc."totalWeightGr")::numeric, 1) AS "Ø Mass (g)"
FROM fish_catches fc
JOIN fish_species fs ON fc."speciesId" = fs.id
WHERE fc."samplingId" = ${samplingId}
GROUP BY fs.id, fs."speciesName", fs."germanName"
ORDER BY "Count" DESC;`;

    try {
      const response = await fetch("/api/query/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: detailQuery }),
      });

      const data = await response.json();

      if (response.ok) {
        setSamplingDetails(data.data.result || []);
      } else {
        setSamplingDetails([]);
      }
    } catch {
      setSamplingDetails([]);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleSqlQuery = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSelectedSamplingId(null);
    setSamplingDetails([]);

    const executableQuery = getExecutableQuery();

    try {
      const response = await fetch("/api/query/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: executableQuery,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle error response
        setError(data.details || data.error || "Ein Fehler ist aufgetreten");
        setResults([]);
      } else {
        // Handle success response
        setResults(data.data.result || []);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerkfehler");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadCsv = useCallback(() => {
    if (results.length === 0) return;
    const columns = Object.keys(results[0]);
    const escapeCsv = (val: unknown) => {
      const str = String(val ?? "");
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const lines: string[] = [];
    // 1. SQL query
    lines.push("# SQL Query");
    lines.push(escapeCsv(getExecutableQuery()));
    lines.push("");
    // 2. Column headers + data
    lines.push(columns.map(escapeCsv).join(","));
    for (const row of results) {
      lines.push(columns.map((c) => escapeCsv(row[c])).join(","));
    }

    const bom = "\uFEFF";
    const blob = new Blob([bom + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `query-ergebnis-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, getExecutableQuery]);

  // Extract locations from results if they have lat/lon fields
  const locations = results
    .filter((row) => {
      const hasLat = "latitude" in row || "lat" in row;
      const hasLon = "longitude" in row || "lon" in row;
      return hasLat && hasLon;
    })
    .map((row, i) => {
      const lat = Number(row.latitude || row.lat);
      const lon = Number(row.longitude || row.lon);

      // Try to create a meaningful label from available data
      // Exclude lat/lon fields from the label
      const excludeFields = ["latitude", "longitude", "lat", "lon", "id"];
      const labelParts: string[] = [];

      // Common field names to prioritize for labels
      const priorityFields = [
        "species",
        "name",
        "spot",
        "location",
        "site",
        "place",
        "title",
        "label",
      ];

      // First try priority fields
      for (const field of priorityFields) {
        if (field in row && row[field] != null && row[field] !== "") {
          labelParts.push(String(row[field]));
          break; // Use only the first priority field found
        }
      }

      // If no priority field found, use other available fields (up to 2)
      if (labelParts.length === 0) {
        const otherFields = Object.keys(row).filter(
          (key) =>
            !excludeFields.includes(key.toLowerCase()) &&
            row[key] != null &&
            row[key] !== "",
        );

        for (let j = 0; j < Math.min(2, otherFields.length); j++) {
          labelParts.push(String(row[otherFields[j]]));
        }
      }

      // Fallback to generic label if nothing found
      const label =
        labelParts.length > 0 ? labelParts.join(" — ") : `Eintrag ${i + 1}`;

      return { lat, lon, label: String(label) };
    });

  return (
    <div className="flex-1 bg-[#f5f8fa] dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">
            SQL Query
          </h1>
          <DarkModeToggle variant="page" />
        </div>

        {/* Abfragen — Standardabfragen + Gespeicherte in einer Karte */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Frequently Used Queries
            </h2>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {presetQueries.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetChange(preset.id)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    selectedPreset === preset.id
                      ? "border-teal-500 bg-teal-50 dark:bg-teal-900/30 ring-2 ring-teal-200 dark:ring-teal-800"
                      : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {preset.label}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {preset.description}
                  </div>
                </button>
              ))}
            </div>

            {/* Parameter-Eingabe */}
            {currentPreset?.hasParameter && (
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {currentPreset.parameterLabel}
                </label>
                <input
                  type="text"
                  value={parameter}
                  onChange={(e) => setParameter(e.target.value)}
                  placeholder={currentPreset.parameterPlaceholder}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                />
              </div>
            )}
          </div>

          {/* Gespeicherte Abfragen — gleiche Karte */}
          {savedQueries.length > 0 && (
            <>
              <div className="px-6 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700">
                <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Saved Queries ({savedQueries.length})
                </h2>
              </div>
              <div className="px-6 py-3 pt-0 max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {savedQueries.map((sq) => (
                      <tr
                        key={sq.id}
                        className="border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <td className="py-2 pr-3 w-full">
                          {editingQueryId === sq.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    handleRenameSavedQuery(sq.id);
                                  if (e.key === "Escape") {
                                    setEditingQueryId(null);
                                    setEditingName("");
                                  }
                                }}
                                autoFocus
                                className="flex-1 px-2 py-1 border border-teal-400 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                              />
                              <button
                                onClick={() => handleRenameSavedQuery(sq.id)}
                                className="text-xs px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700"
                              >
                                OK
                              </button>
                              <button
                                onClick={() => {
                                  setEditingQueryId(null);
                                  setEditingName("");
                                }}
                                className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500"
                              >
                                Abort
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleLoadSavedQuery(sq)}
                              className="text-left w-full truncate text-gray-800 dark:text-gray-200 hover:text-teal-700 dark:hover:text-teal-400 font-medium"
                              title={sq.query}
                            >
                              {sq.name}
                            </button>
                          )}
                        </td>
                        {editingQueryId !== sq.id && (
                          <td className="py-2 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewQuery(sq);
                                }}
                                title="Preview"
                                className="p-1 rounded text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-3.5 w-3.5"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                  <path
                                    fillRule="evenodd"
                                    d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingQueryId(sq.id);
                                  setEditingName(sq.name);
                                }}
                                title="Rename"
                                className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-3.5 w-3.5"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSavedQuery(sq.id);
                                }}
                                title="Delete"
                                className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-3.5 w-3.5"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm mb-6">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              SQL Query
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSaveDialog(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" />
                </svg>
                Save
              </button>
              <button
                onClick={handleSqlQuery}
                disabled={
                  isLoading || (currentPreset?.hasParameter && !parameter)
                }
                className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isLoading ? "Being executed ..." : "Execute"}
              </button>
            </div>
          </div>
          <div className="px-6 pb-6 pt-4">
            <textarea
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedPreset("custom");
              }}
              className="w-full h-40 resize-y rounded-lg border border-gray-200 dark:border-gray-600 bg-[#f7fafc] dark:bg-gray-900 p-4 font-mono text-sm text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-teal-500"
            />
            {currentPreset?.hasParameter && parameter && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium">Executed Query:</span>
                <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-auto text-gray-800 dark:text-gray-200">
                  {getExecutableQuery()}
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* Preview Query Dialog */}
        {previewQuery && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                  {previewQuery.name}
                </h3>
                <button
                  onClick={() => setPreviewQuery(null)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
              <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
                {previewQuery.query}
              </pre>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setPreviewQuery(null)}
                  className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    handleLoadSavedQuery(previewQuery);
                    setPreviewQuery(null);
                  }}
                  className="px-4 py-2 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700 font-medium"
                >
                  Load to Editor
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div
            className={`fixed top-6 right-6 z-[60] px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all animate-in fade-in slide-in-from-top-2 ${
              toast.type === "error"
                ? "bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"
                : "bg-teal-50 dark:bg-teal-900/40 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300"
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === "error" ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 flex-shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 flex-shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {toast.message}
              <button
                onClick={() => setToast(null)}
                className="ml-2 opacity-60 hover:opacity-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Confirm Load Dialog */}
        {confirmLoad && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-amber-600"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                  Replace Query?
                </h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                The current query in the editor will be replaced by the
                following query:{" "}
                <strong>&ldquo;{confirmLoad.name}&rdquo;</strong>{" "}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                This step cannot be revoked.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmLoad(null)}
                  className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Abort
                </button>
                <button
                  onClick={confirmLoadQuery}
                  className="px-4 py-2 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700 font-medium"
                >
                  Replace
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save Query Dialog */}
        {showSaveDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
                Save Query
              </h3>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name
              </label>
              <input
                type="text"
                value={saveQueryName}
                onChange={(e) => setSaveQueryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveQuery();
                  if (e.key === "Escape") setShowSaveDialog(false);
                }}
                placeholder="z.B. Meine Fischarten-Abfrage"
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none mb-3 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
              />
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-4 font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 max-h-20 overflow-auto">
                {query.slice(0, 200)}
                {query.length > 200 ? "..." : ""}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSaveQueryName("");
                  }}
                  className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSaveQuery}
                  disabled={!saveQueryName.trim() || isSaving}
                  className="px-4 py-2 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                >
                  {isSaving ? "Saving ..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm mb-6">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Results
            </h2>
            {results.length > 0 && (
              <button
                onClick={handleDownloadCsv}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                Download CSV
              </button>
            )}
          </div>
          <div className="px-6 py-8">
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-4">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  Error
                </p>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                  {error}
                </p>
              </div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Loading ...
                </div>
              </div>
            ) : results.length > 0 ? (
              <div className="overflow-auto">
                <ResultsTable
                  rows={results}
                  onRowClick={handleSamplingClick}
                  clickableColumn="Fishing-ID"
                  selectedId={selectedSamplingId}
                />
                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  {results.length} Zeilen
                  {results.some((r) => "Fishing-ID" in r) && (
                    <span className="ml-2 text-teal-600 dark:text-teal-400">
                      (Click on a row to see the details.)
                    </span>
                  )}
                </div>

                {/* Details einer ausgewählten Befischung */}
                {selectedSamplingId !== null && (
                  <div className="mt-6 p-4 bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800 rounded-lg">
                    <h3 className="text-sm font-medium text-teal-800 dark:text-teal-300 mb-3">
                      Catches of fishing #{selectedSamplingId}
                    </h3>
                    {isLoadingDetails ? (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Loading ...
                      </div>
                    ) : samplingDetails.length > 0 ? (
                      <div className="overflow-auto">
                        <ResultsTable rows={samplingDetails} />
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        No catches for this specific fishing found.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                No results. Please execute a query.
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Locations
              </h2>
            </div>
            <div className="px-6 py-6">
              {locations.length > 0 ? (
                <ul className="space-y-2">
                  {locations.map((loc, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2"
                    >
                      <span className="text-sm text-gray-800 dark:text-gray-200">
                        {loc.label}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {loc.lat.toFixed(5)}, {loc.lon.toFixed(5)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                  No locations with coordinates found in the results.
                </div>
              )}
            </div>
          </section>

          <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
            <MapComponent locations={locations} />
          </section>
        </div>
      </div>
    </div>
  );
};

function ResultsTable({
  rows,
  onRowClick,
  clickableColumn,
  selectedId,
}: {
  rows: Record<string, unknown>[];
  onRowClick?: (id: number) => void;
  clickableColumn?: string;
  selectedId?: number | null;
}) {
  if (rows.length === 0) return null;
  const columns = Object.keys(rows[0]);
  const isClickable = clickableColumn && columns.includes(clickableColumn);

  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr className="bg-slate-50 dark:bg-gray-700">
          {columns.map((c) => (
            <th
              key={c}
              className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600"
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const rowId = clickableColumn ? Number(r[clickableColumn]) : null;
          const isSelected = selectedId !== null && rowId === selectedId;

          return (
            <tr
              key={i}
              className={`
                ${isClickable ? "cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors" : ""}
                ${isSelected ? "bg-teal-100 dark:bg-teal-900/50 ring-1 ring-teal-400 dark:ring-teal-600" : "odd:bg-white even:bg-slate-50 dark:odd:bg-gray-800 dark:even:bg-gray-900"}
              `}
              onClick={() => {
                if (isClickable && onRowClick && rowId !== null) {
                  onRowClick(rowId);
                }
              }}
            >
              {columns.map((c) => (
                <td
                  key={c}
                  className={`whitespace-nowrap px-3 py-2 border-b border-gray-100 dark:border-gray-700 ${
                    isSelected
                      ? "text-teal-900 dark:text-teal-300 font-medium"
                      : "text-gray-800 dark:text-gray-200"
                  }`}
                >
                  {String(r[c] ?? "")}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default SqlQueryUIDesign;
