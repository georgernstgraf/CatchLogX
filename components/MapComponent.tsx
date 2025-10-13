"use client";

import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// Fix for default marker icons in React-Leaflet
const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
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
      const bounds = L.latLngBounds(
        locations.map((loc) => [loc.lat, loc.lon])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [locations, map]);

  return null;
}

const MapComponent: React.FC<MapComponentProps> = ({ locations }) => {
  // Default center (Vienna, Austria)
  const defaultCenter: [number, number] = [48.2082, 16.3738];
  const defaultZoom = 11;

  return (
    <div className="h-[320px] w-full relative">
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
    </div>
  );
};

export default MapComponent;
