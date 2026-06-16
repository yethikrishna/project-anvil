/**
 * MapView — geotagged photos on an interactive map.
 *
 * Uses Leaflet (lightweight, no API key required) with OpenStreetMap tiles.
 * Groups nearby photos with marker clustering.
 *
 * NOTE: Leaflet is dynamically imported (SSR-safe).
 */

'use client';

import { useEffect, useRef } from 'react';
import { usePhotosStore } from '@/lib/store';

export default function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<{ map: L.Map; markers: L.Layer[] } | null>(null);
  const { photos, openLightbox } = usePhotosStore();

  // Only photos with geo
  const geoPhotos = photos.filter((p) => p.lat != null && p.lng != null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Dynamic import of Leaflet (ESM only)
    import('leaflet').then((L) => {
      if (!mapRef.current) return;

      // Init map once
      if (!leafletRef.current) {
        const map = L.map(mapRef.current, {
          center: [20, 0],
          zoom: 2,
          zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        leafletRef.current = { map, markers: [] };
      }

      const { map } = leafletRef.current;

      // Clear existing markers
      for (const m of leafletRef.current.markers) {
        map.removeLayer(m);
      }
      leafletRef.current.markers = [];

      if (geoPhotos.length === 0) return;

      // Add markers
      const bounds: L.LatLngTuple[] = [];
      for (const photo of geoPhotos) {
        if (photo.lat == null || photo.lng == null) continue;
        const latLng: L.LatLngTuple = [photo.lat, photo.lng];
        bounds.push(latLng);

        const icon = L.divIcon({
          html: `<div style="
            width: 40px; height: 40px; border-radius: 6px; overflow: hidden;
            border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            background: #262626;
          ">
            ${photo.thumbnailUrl
              ? `<img src="${photo.thumbnailUrl}" style="width:100%;height:100%;object-fit:cover">`
              : `<div style="width:100%;height:100%;background:#404040"></div>`}
          </div>`,
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 40],
        });

        const marker = L.marker(latLng, { icon });
        marker.on('click', () => openLightbox(photo.id));
        if (photo.locationName) {
          marker.bindTooltip(photo.locationName, { direction: 'top', offset: [0, -44] });
        }
        marker.addTo(map);
        leafletRef.current.markers.push(marker);
      }

      // Fit bounds
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    }).catch(console.error);

    return () => {
      if (leafletRef.current) {
        leafletRef.current.map.remove();
        leafletRef.current = null;
      }
    };
  }, [geoPhotos.length]);

  if (geoPhotos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-neutral-500">
        <div className="text-4xl mb-3">🗺️</div>
        <p className="text-sm">No geotagged photos found.</p>
        <p className="text-xs mt-1">Photos taken with location enabled will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <div ref={mapRef} className="w-full h-full min-h-[500px]" />
      <div className="absolute top-3 left-3 z-10 bg-neutral-900/90 text-xs text-neutral-300 px-2 py-1 rounded-lg border border-neutral-700">
        {geoPhotos.length} geotagged photos
      </div>
    </div>
  );
}
