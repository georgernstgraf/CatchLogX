"use client";

import React, { useState } from "react";



const SqlQueryUIDesign: React.FC = () => {
  const defaultQuery = "SELECT * FROM fish;";
  const [query, setQuery] = useState<string>(defaultQuery);
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSqlQuery = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/query/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query,
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
      const label = row.species || row.spot || row.label || `Eintrag ${i + 1}`;
      return { lat, lon, label: String(label) };
    });

  return (
    <div className="flex-1 bg-[#f5f8fa]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-gray-800 mb-6">SQL Query</h1>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-sm font-medium text-gray-700">SQL Query</h2>
            <button
              onClick={handleSqlQuery}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? "Wird ausgeführt..." : "Ausführen"}
            </button>
          </div>
          <div className="px-6 pb-6 pt-4">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (query === defaultQuery) setQuery("");
              }}
              onClick={() => {
                if (query === defaultQuery) setQuery("");
              }}
              className="w-full h-40 resize-y rounded-lg border border-gray-200 bg-[#f7fafc] p-4 font-mono text-sm text-gray-800 outline-none focus:ring-2 focus:ring-teal-500"
            />
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
                <ResultsTable rows={results} />
                <div className="mt-3 text-xs text-gray-500">
                  {results.length} Zeilen
                </div>
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
            <MapPlaceholder />
          </section>
        </div>
      </div>
    </div>
  );
};

function ResultsTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return null;
  const columns = Object.keys(rows[0]);

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
        {rows.map((r, i) => (
          <tr key={i} className="odd:bg-white even:bg-slate-50">
            {columns.map((c) => (
              <td
                key={c}
                className="whitespace-nowrap px-3 py-2 text-gray-800 border-b border-gray-100"
              >
                {String(r[c])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MapPlaceholder() {
  return (
    <div className="relative h-[320px] w-full bg-[url('data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22512%22 height=%22312%22 viewBox=%220 0 512 312%22%3E%3Crect width=%22512%22 height=%22312%22 fill=%22%23e5e7eb%22/%3E%3Cpath d=%22M0 64h512M0 128h512M0 192h512M0 256h512M64 0v312M128 0v312M192 0v312M256 0v312M320 0v312M384 0v312M448 0v312%22 stroke=%22%23cbd5e1%22 stroke-width=%221%22/%3E%3C/svg%3E')] bg-cover">
      <div className="absolute inset-0 flex items-end justify-center pb-2 pointer-events-none">
        <span className="text-[10px] text-gray-700 bg-white/70 rounded px-2 py-0.5 border border-gray-300">
          © OpenStreetMap
        </span>
      </div>
      <div className="absolute right-3 top-3 flex flex-col gap-2">
        <button
          aria-label="Zoom in"
          className="h-8 w-8 rounded bg-white text-gray-600 shadow border border-gray-200 leading-none"
        >
          +
        </button>
        <button
          aria-label="Zoom out"
          className="h-8 w-8 rounded bg-white text-gray-600 shadow border border-gray-200 leading-none"
        >
          −
        </button>
        <button
          aria-label="Vollbild"
          className="h-8 w-8 rounded bg-white text-gray-600 shadow border border-gray-200 leading-none"
          title="Vollbild"
        >
          ⛶
        </button>
      </div>
    </div>
  );
}

export default SqlQueryUIDesign;
