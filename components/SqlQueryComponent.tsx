"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";

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

// Standardabfragen
const presetQueries: PresetQuery[] = [
  {
    id: "custom",
    label: "Eigene Abfrage",
    description: "Schreiben Sie Ihre eigene SQL-Abfrage",
    query: "SELECT * FROM fish_species;",
  },
  {
    id: "species_rivers",
    label: "Fischarten nach Fluss/Befischungsstelle",
    description: "Zeigt, welche Fischarten in welchen Flüssen/Befischungsstellen vorkommen",
    query: `SELECT DISTINCT
  fs."speciesName" AS "Fischart",
  fs."germanName" AS "Deutscher Name",
  rs."riverName" AS "Fluss",
  rs."siteName" AS "Befischungsstelle",
  rs."siteCode" AS "Standortcode"
FROM fish_catches fc
JOIN fish_species fs ON fc."speciesId" = fs.id
JOIN samplings s ON fc."samplingId" = s.id
JOIN river_sites rs ON s."siteId" = rs.id
ORDER BY rs."riverName", fs."speciesName";`,
  },
  {
    id: "species_by_site",
    label: "Arten an Fluss/Befischungsstelle",
    description: "Listet alle Arten auf, die an einem bestimmten Fluss oder einer Befischungsstelle vorkommen",
    query: `SELECT DISTINCT
  fs."speciesName" AS "Fischart",
  fs."germanName" AS "Deutscher Name",
  fs."latinName" AS "Lateinischer Name",
  fs."family" AS "Familie",
  COUNT(fc.id) AS "Anzahl Fänge"
FROM fish_catches fc
JOIN fish_species fs ON fc."speciesId" = fs.id
JOIN samplings s ON fc."samplingId" = s.id
JOIN river_sites rs ON s."siteId" = rs.id
WHERE rs."riverName" ILIKE '%{{PARAMETER}}%' OR rs."siteName" ILIKE '%{{PARAMETER}}%'
GROUP BY fs.id, fs."speciesName", fs."germanName", fs."latinName", fs."family"
ORDER BY "Anzahl Fänge" DESC;`,
    hasParameter: true,
    parameterLabel: "Fluss- oder Stellenname",
    parameterPlaceholder: "z.B. Donau, Mur, ...",
  },
  {
    id: "samplings_by_river",
    label: "Befischungen an einem Fluss",
    description: "Listet alle Befischungen an einem Fluss mit Koordinaten, Seehöhe und Datum",
    query: `SELECT
  s.id AS "Befischungs-ID",
  rs."riverName" AS "Fluss",
  rs."siteName" AS "Befischungsstelle",
  rs."siteCode" AS "Standortcode",
  rs.latitude AS "latitude",
  rs.longitude AS "longitude",
  s."catchDate" AS "Datum",
  s.year AS "Jahr",
  s.method AS "Methode",
  s."dataProvider" AS "Datenquelle",
  s.project AS "Projekt"
FROM samplings s
JOIN river_sites rs ON s."siteId" = rs.id
WHERE rs."riverName" ILIKE '%{{PARAMETER}}%'
ORDER BY s."catchDate" DESC NULLS LAST, s.year DESC;`,
    hasParameter: true,
    parameterLabel: "Flussname",
    parameterPlaceholder: "z.B. Donau, Mur, ...",
  },
  {
    id: "catches_by_sampling",
    label: "Fänge einer Befischung",
    description: "Zeigt alle gefangenen Arten mit Anzahl und Länge für eine bestimmte Befischung",
    query: `SELECT
  fs."speciesName" AS "Fischart",
  fs."germanName" AS "Deutscher Name",
  COUNT(fc.id) AS "Anzahl",
  ROUND(AVG(fc."lengthMm")::numeric, 1) AS "Ø Länge (mm)",
  MIN(fc."lengthMm") AS "Min Länge (mm)",
  MAX(fc."lengthMm") AS "Max Länge (mm)",
  ROUND(AVG(fc."totalWeightGr")::numeric, 1) AS "Ø Gewicht (g)"
FROM fish_catches fc
JOIN fish_species fs ON fc."speciesId" = fs.id
WHERE fc."samplingId" = {{PARAMETER}}
GROUP BY fs.id, fs."speciesName", fs."germanName"
ORDER BY "Anzahl" DESC;`,
    hasParameter: true,
    parameterLabel: "Befischungs-ID",
    parameterPlaceholder: "z.B. 1, 2, 3, ...",
  },
  {
    id: "all_samplings",
    label: "Alle Befischungen (mit Koordinaten)",
    description: "Übersicht aller Befischungen mit Standortinformationen",
    query: `SELECT
  s.id AS "Befischungs-ID",
  rs."riverName" AS "Fluss",
  rs."siteName" AS "Befischungsstelle",
  rs.latitude AS "latitude",
  rs.longitude AS "longitude",
  s."catchDate" AS "Datum",
  s.year AS "Jahr",
  COUNT(fc.id) AS "Anzahl Fänge"
FROM samplings s
JOIN river_sites rs ON s."siteId" = rs.id
LEFT JOIN fish_catches fc ON fc."samplingId" = s.id
GROUP BY s.id, rs."riverName", rs."siteName", rs.latitude, rs.longitude, s."catchDate", s.year
ORDER BY s.year DESC, s."catchDate" DESC NULLS LAST;`,
  },
];

// Dynamically import MapContainer to avoid SSR issues with Leaflet
const MapComponent = dynamic<{ locations: Location[] }>(
  () => import("./MapComponent"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] w-full bg-gray-100 flex items-center justify-center">
        <span className="text-sm text-gray-500">Karte wird geladen...</span>
      </div>
    ),
  }
);

const SqlQueryUIDesign: React.FC = () => {
  const defaultQuery = presetQueries[0].query;
  const [query, setQuery] = useState<string>(defaultQuery);
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>("custom");
  const [parameter, setParameter] = useState<string>("");
  const [selectedSamplingId, setSelectedSamplingId] = useState<number | null>(null);
  const [samplingDetails, setSamplingDetails] = useState<Record<string, unknown>[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

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

  const getExecutableQuery = () => {
    if (currentPreset?.hasParameter && parameter) {
      return query.replace(/\{\{PARAMETER\}\}/g, parameter);
    }
    return query;
  };

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
  fs."speciesName" AS "Fischart",
  fs."germanName" AS "Deutscher Name",
  COUNT(fc.id) AS "Anzahl",
  ROUND(AVG(fc."lengthMm")::numeric, 1) AS "Ø Länge (mm)",
  MIN(fc."lengthMm") AS "Min Länge (mm)",
  MAX(fc."lengthMm") AS "Max Länge (mm)",
  ROUND(AVG(fc."totalWeightGr")::numeric, 1) AS "Ø Gewicht (g)"
FROM fish_catches fc
JOIN fish_species fs ON fc."speciesId" = fs.id
WHERE fc."samplingId" = ${samplingId}
GROUP BY fs.id, fs."speciesName", fs."germanName"
ORDER BY "Anzahl" DESC;`;

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

  // Extract locations from results if they have lat/lon fields
  const locations = results
    .filter((row) => {
      const hasLat = 'latitude' in row || 'lat' in row;
      const hasLon = 'longitude' in row || 'lon' in row;
      return hasLat && hasLon;
    })
    .map((row, i) => {
      const lat = Number(row.latitude || row.lat);
      const lon = Number(row.longitude || row.lon);
      
      // Try to create a meaningful label from available data
      // Exclude lat/lon fields from the label
      const excludeFields = ['latitude', 'longitude', 'lat', 'lon', 'id'];
      const labelParts: string[] = [];
      
      // Common field names to prioritize for labels
      const priorityFields = ['species', 'name', 'spot', 'location', 'site', 'place', 'title', 'label'];
      
      // First try priority fields
      for (const field of priorityFields) {
        if (field in row && row[field] != null && row[field] !== '') {
          labelParts.push(String(row[field]));
          break; // Use only the first priority field found
        }
      }
      
      // If no priority field found, use other available fields (up to 2)
      if (labelParts.length === 0) {
        const otherFields = Object.keys(row).filter(
          key => !excludeFields.includes(key.toLowerCase()) && row[key] != null && row[key] !== ''
        );
        
        for (let j = 0; j < Math.min(2, otherFields.length); j++) {
          labelParts.push(String(row[otherFields[j]]));
        }
      }
      
      // Fallback to generic label if nothing found
      const label = labelParts.length > 0 ? labelParts.join(' — ') : `Eintrag ${i + 1}`;
      
      return { lat, lon, label: String(label) };
    });

  return (
    <div className="flex-1 bg-[#f5f8fa]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-gray-800 mb-6">SQL Query</h1>

        {/* Preset-Auswahl */}
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-sm font-medium text-gray-700">Standardabfragen</h2>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {presetQueries.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetChange(preset.id)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    selectedPreset === preset.id
                      ? "border-teal-500 bg-teal-50 ring-2 ring-teal-200"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="text-sm font-medium text-gray-800">{preset.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{preset.description}</div>
                </button>
              ))}
            </div>

            {/* Parameter-Eingabe */}
            {currentPreset?.hasParameter && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {currentPreset.parameterLabel}
                </label>
                <input
                  type="text"
                  value={parameter}
                  onChange={(e) => setParameter(e.target.value)}
                  placeholder={currentPreset.parameterPlaceholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                />
              </div>
            )}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-sm font-medium text-gray-700">SQL Query</h2>
            <button
              onClick={handleSqlQuery}
              disabled={isLoading || (currentPreset?.hasParameter && !parameter)}
              className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? "Wird ausgeführt..." : "Ausführen"}
            </button>
          </div>
          <div className="px-6 pb-6 pt-4">
            <textarea
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedPreset("custom");
              }}
              className="w-full h-40 resize-y rounded-lg border border-gray-200 bg-[#f7fafc] p-4 font-mono text-sm text-gray-800 outline-none focus:ring-2 focus:ring-teal-500"
            />
            {currentPreset?.hasParameter && parameter && (
              <div className="mt-2 text-xs text-gray-500">
                <span className="font-medium">Ausgeführte Query:</span>
                <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto">
                  {getExecutableQuery()}
                </pre>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-sm font-medium text-gray-700">Ergebnisse</h2>
          </div>
          <div className="px-6 py-8">
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-4">
                <p className="text-sm font-medium text-red-800">Fehler</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-gray-500">Wird geladen...</div>
              </div>
            ) : results.length > 0 ? (
              <div className="overflow-auto">
                <ResultsTable 
                  rows={results} 
                  onRowClick={handleSamplingClick}
                  clickableColumn="Befischungs-ID"
                  selectedId={selectedSamplingId}
                />
                <div className="mt-3 text-xs text-gray-500">
                  {results.length} Zeilen
                  {results.some(r => 'Befischungs-ID' in r) && (
                    <span className="ml-2 text-teal-600">
                      (Klicken Sie auf eine Zeile, um Details zu sehen)
                    </span>
                  )}
                </div>

                {/* Details einer ausgewählten Befischung */}
                {selectedSamplingId !== null && (
                  <div className="mt-6 p-4 bg-teal-50 border border-teal-200 rounded-lg">
                    <h3 className="text-sm font-medium text-teal-800 mb-3">
                      Fänge der Befischung #{selectedSamplingId}
                    </h3>
                    {isLoadingDetails ? (
                      <div className="text-sm text-gray-500">Wird geladen...</div>
                    ) : samplingDetails.length > 0 ? (
                      <div className="overflow-auto">
                        <ResultsTable rows={samplingDetails} />
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">
                        Keine Fänge für diese Befischung gefunden.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500 text-center py-8">
                Keine Ergebnisse. Führen Sie eine Query aus.
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-sm font-medium text-gray-700">Standorte</h2>
            </div>
            <div className="px-6 py-6">
              {locations.length > 0 ? (
                <ul className="space-y-2">
                  {locations.map((loc, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2"
                    >
                      <span className="text-sm text-gray-800">{loc.label}</span>
                      <span className="text-xs text-gray-500">
                        {loc.lat.toFixed(5)}, {loc.lon.toFixed(5)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-gray-500 text-center py-8">
                  Keine Standorte mit Koordinaten gefunden
                </div>
              )}
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
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
  selectedId 
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
        <tr className="bg-slate-50">
          {columns.map((c) => (
            <th
              key={c}
              className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200"
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
                ${isClickable ? 'cursor-pointer hover:bg-teal-50 transition-colors' : ''}
                ${isSelected ? 'bg-teal-100 ring-1 ring-teal-400' : 'odd:bg-white even:bg-slate-50'}
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
                  className={`whitespace-nowrap px-3 py-2 border-b border-gray-100 ${
                    isSelected ? 'text-teal-900 font-medium' : 'text-gray-800'
                  }`}
                >
                  {String(r[c] ?? '')}
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
