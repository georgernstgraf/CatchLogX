"use client";

import React, { useState } from "react";

const exampleResults = [
	{ id: 1, species: "Hecht", weight_kg: 8.2, length_cm: 98, spot: "Alte Donau", latitude: 48.226, longitude: 16.414 },
	{ id: 2, species: "Zander", weight_kg: 4.1, length_cm: 72, spot: "Donaukanal", latitude: 48.208, longitude: 16.373 },
	{ id: 3, species: "Karpfen", weight_kg: 12.5, length_cm: 82, spot: "Neue Donau", latitude: 48.265, longitude: 16.457 },
];

const exampleLocations = [
	{ lat: 48.226, lon: 16.414, label: "Hecht — Alte Donau" },
	{ lat: 48.208, lon: 16.373, label: "Zander — Donaukanal" },
	{ lat: 48.265, lon: 16.457, label: "Karpfen — Neue Donau" },
];

const SqlQueryUIDesign: React.FC = () => {
	const defaultQuery = "SELECT * FROM fish;";
	const [query, setQuery] = useState<string>(defaultQuery);

	return (
		<div className="flex-1 bg-[#f5f8fa]">
			<div className="max-w-6xl mx-auto px-6 py-8">
				<h1 className="text-2xl font-semibold text-gray-800 mb-6">SQL Query</h1>

				<section className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6">
					<div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
						<h2 className="text-sm font-medium text-gray-700">SQL Query</h2>
						<button className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
							Ausführen
						</button>
					</div>
					<div className="px-6 pb-6 pt-4">
						<textarea
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onFocus={() => { if (query === defaultQuery) setQuery(""); }}
							onClick={() => { if (query === defaultQuery) setQuery(""); }}
							className="w-full h-40 resize-y rounded-lg border border-gray-200 bg-[#f7fafc] p-4 font-mono text-sm text-gray-800 outline-none focus:ring-2 focus:ring-teal-500"
						/>
					</div>
				</section>

				<section className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6">
					<div className="px-6 py-4 border-b border-gray-200">
						<h2 className="text-sm font-medium text-gray-700">Ergebnisse</h2>
					</div>
					<div className="px-6 py-8">
						<div className="overflow-auto">
							<ResultsTable rows={exampleResults} />
							<div className="mt-3 text-xs text-gray-500">
								{exampleResults.length} Zeilen
							</div>
						</div>
					</div>
				</section>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<section className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm">
						<div className="px-6 py-4 border-b border-gray-200">
							<h2 className="text-sm font-medium text-gray-700">Standorte</h2>
						</div>
						<div className="px-6 py-6">
							<ul className="space-y-2">
								{exampleLocations.map((loc, i) => (
									<li key={i} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
										<span className="text-sm text-gray-800">{loc.label}</span>
										<span className="text-xs text-gray-500">
											{loc.lat.toFixed(5)}, {loc.lon.toFixed(5)}
										</span>
									</li>
								))}
							</ul>
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