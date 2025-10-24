"use client";

import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// Fix for default marker icons in React-Leaflet
const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Location {
  lat: number;
  lon: number;
  label: string;
}

interface MapComponentProps {
  locations: Location[];
}

// Component to adjust map bounds when locations change
function MapBoundsUpdater({ locations }: { locations: Location[] }) {
  const map = useMap();

  useEffect(() => {
    if (locations.length > 0) {
      const bounds = L.latLngBounds(locations.map((loc) => [loc.lat, loc.lon]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [locations, map]);

  return null;
}

const MapComponent: React.FC<MapComponentProps> = ({ locations }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Default center (Vienna, Austria)
  const defaultCenter: [number, number] = [48.2082, 16.3738];
  const defaultZoom = 11;

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    // Close if clicking the overlay background (not the map container)
    if (e.target === e.currentTarget) {
      setIsExpanded(false);
    }
  };

  return (
    <>
      {/* Normal map view */}
      <div className={`${isExpanded ? "hidden" : "h-full"} w-full relative`}>
        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          className="h-full w-full"
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {locations.map((location, index) => (
            <Marker
              key={index}
              position={[location.lat, location.lon]}
              icon={icon}
            >
              <Popup>
                <div className="text-sm">
                  <strong>{location.label}</strong>
                  <br />
                  <span className="text-xs text-gray-600">
                    {location.lat.toFixed(5)}, {location.lon.toFixed(5)}
                  </span>
                </div>
              </Popup>
            </Marker>
          ))}

          {locations.length > 0 && <MapBoundsUpdater locations={locations} />}
        </MapContainer>

        {/* Expand button */}
        <button
          onClick={toggleExpand}
          className="absolute right-3 bottom-3 z-[1000] h-8 w-8 rounded bg-white text-gray-700 shadow-md border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-lg font-bold"
          title="Vollbild"
          aria-label="Vollbild"
        >
          ⛶
        </button>
      </div>

      {/* Expanded fullscreen map */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-[9999] bg-black bg-opacity-50 flex items-center justify-center p-4"
          onClick={handleOverlayClick}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full h-full max-w-7xl max-h-[90vh] overflow-hidden relative">
            <div className="h-full w-full">
              <MapContainer
                center={defaultCenter}
                zoom={defaultZoom}
                className="h-full w-full"
                scrollWheelZoom={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {locations.map((location, index) => (
                  <Marker
                    key={index}
                    position={[location.lat, location.lon]}
                    icon={icon}
                  >
                    <Popup>
                      <div className="text-sm">
                        <strong>{location.label}</strong>
                        <br />
                        <span className="text-xs text-gray-600">
                          {location.lat.toFixed(5)}, {location.lon.toFixed(5)}
                        </span>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {locations.length > 0 && (
                  <MapBoundsUpdater locations={locations} />
                )}
              </MapContainer>
            </div>

            {/* Close button */}
            <button
              onClick={() => setIsExpanded(false)}
              className="absolute top-4 right-4 z-[1000] h-10 w-10 rounded-full bg-white text-gray-700 shadow-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-xl font-bold"
              title="Schließen"
              aria-label="Schließen"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default MapComponent;
