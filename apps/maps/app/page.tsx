'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cn, AppShell, ThemeProvider, ThemeToggle } from '@anvil/ui';
import { NotificationProvider, NotificationBell } from '@anvil/notifications';

// ─── Types ───

interface GeoResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  icon?: string;
}

interface RouteStep {
  maneuver: { type: string; modifier?: string; location: [number, number] };
  name: string;
  distance: number;
  duration: number;
}

interface RouteLeg {
  steps: RouteStep[];
  distance: number;
  duration: number;
}

interface SearchResult {
  id: string;
  text: string;
  place_name: string;
  center: [number, number];
  place_type: string[];
}

// ─── useGeolocation Hook ───

function useGeolocation() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  return { position, loading, error, requestLocation };
}

// ─── Nominatim Geocoding ───

async function geocodeSearch(query: string, proximity?: [number, number]): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '8',
    addressdetails: '1',
  });
  if (proximity) {
    params.set('viewbox', `${proximity[0] - 0.5},${proximity[1] + 0.5},${proximity[0] + 0.5},${proximity[1] - 0.5}`);
    params.set('bounded', '0');
  }

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'Accept-Language': 'en' },
  });
  if (!res.ok) return [];
  const data: GeoResult[] = await res.json();
  return data.map((r, i) => ({
    id: `result-${r.place_id}-${i}`,
    text: r.display_name.split(',')[0],
    place_name: r.display_name,
    center: [parseFloat(r.lon), parseFloat(r.lat)],
    place_type: [r.type],
  }));
}

// ─── OSRM Routing ───

async function fetchRoute(
  from: [number, number],
  to: [number, number]
): Promise<{ legs: RouteLeg[]; geometry: [number, number][] } | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=true`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    const route = data.routes[0];
    return {
      legs: route.legs,
      geometry: route.geometry.coordinates,
    };
  } catch {
    return null;
  }
}

// ─── POI Data ───

const SAMPLE_POIS = [
  { id: 'poi-1', name: 'Central Park', lat: 40.7829, lng: -73.9654, category: 'park' },
  { id: 'poi-2', name: 'Times Square', lat: 40.758, lng: -73.9855, category: 'landmark' },
  { id: 'poi-3', name: 'Empire State Building', lat: 40.7484, lng: -73.9857, category: 'landmark' },
  { id: 'poi-4', name: 'Brooklyn Bridge', lat: 40.7061, lng: -73.9969, category: 'landmark' },
  { id: 'poi-5', name: 'Statue of Liberty', lat: 40.6892, lng: -74.0445, category: 'landmark' },
  { id: 'poi-6', name: 'Grand Central Terminal', lat: 40.7527, lng: -73.9772, category: 'transit' },
  { id: 'poi-7', name: 'Rockefeller Center', lat: 40.7587, lng: -73.9787, category: 'landmark' },
  { id: 'poi-8', name: 'High Line Park', lat: 40.748, lng: -74.0048, category: 'park' },
  { id: 'poi-9', name: 'One World Trade Center', lat: 40.7127, lng: -74.0134, category: 'landmark' },
  { id: 'poi-10', name: 'Central Station Cafe', lat: 40.753, lng: -73.976, category: 'food' },
  { id: 'poi-11', name: 'Battery Park', lat: 40.7033, lng: -74.017, category: 'park' },
  { id: 'poi-12', name: 'Chinatown', lat: 40.7158, lng: -73.997, category: 'neighborhood' },
  { id: 'poi-13', name: 'SoHo', lat: 40.7233, lng: -73.9985, category: 'neighborhood' },
  { id: 'poi-14', name: 'Wall Street', lat: 40.7074, lng: -74.0113, category: 'landmark' },
  { id: 'poi-15', name: 'MoMA', lat: 40.7614, lng: -73.9776, category: 'museum' },
  { id: 'poi-16', name: 'Met Museum', lat: 40.7794, lng: -73.9632, category: 'museum' },
  { id: 'poi-17', name: 'Madison Square Garden', lat: 40.7505, lng: -73.9934, category: 'venue' },
  { id: 'poi-18', name: 'Yankee Stadium', lat: 40.8296, lng: -73.9262, category: 'venue' },
  { id: 'poi-19', name: 'Flushing Meadows', lat: 40.7400, lng: -73.8407, category: 'park' },
  { id: 'poi-20', name: 'JFK Airport', lat: 40.6413, lng: -73.7781, category: 'transit' },
];

// ─── Slide-up Sheet Component ───

function SlideUpSheet({ isOpen, onClose, children, title }: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  const [dragY, setDragY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);

  if (!isOpen) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = e.touches[0].clientY - startYRef.current;
    if (diff > 0) setDragY(diff);
  };

  const handleTouchEnd = () => {
    if (dragY > 100) onClose();
    setDragY(0);
  };

  return (
    <div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl transition-transform duration-200"
      style={{ transform: `translateY(${dragY}px)`, maxHeight: '60vh' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex justify-center pt-2 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>
      {title && (
        <div className="flex items-center justify-between px-4 pb-2 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}
      <div className="overflow-auto px-4 py-3" style={{ maxHeight: 'calc(60vh - 60px)' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Format Helpers ───

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ─── Main Page ───

export default function MapsPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const routeLayerAdded = useRef(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<SearchResult | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  // Routing state
  const [routingMode, setRoutingMode] = useState(false);
  const [routeFrom, setRouteFrom] = useState<[number, number] | null>(null);
  const [routeTo, setRouteTo] = useState<[number, number] | null>(null);
  const [routeData, setRouteData] = useState<{ legs: RouteLeg[]; geometry: [number, number][] } | null>(null);
  const [routingLoading, setRoutingLoading] = useState(false);

  // Geolocation
  const geo = useGeolocation();

  // Map style
  const mapStyle = 'https://demotiles.maplibre.org/style.json';

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center: [-73.9857, 40.7484], // NYC
      zoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    map.on('load', () => {
      // Add POI source and layer
      map.addSource('pois', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: SAMPLE_POIS.map((poi) => ({
            type: 'Feature',
            properties: { id: poi.id, name: poi.name, category: poi.category },
            geometry: { type: 'Point', coordinates: [poi.lng, poi.lat] },
          })),
        },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Cluster circles
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'pois',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#4285F4',
          'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 50, 25],
          'circle-opacity': 0.7,
        },
      });

      // Cluster count
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'pois',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
        },
        paint: { 'text-color': '#fff' },
      });

      // Individual POI markers
      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'pois',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#EA4335',
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      // Click on cluster to zoom
      map.on('click', 'clusters', async (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        const clusterId = features[0]?.properties?.cluster_id;
        if (clusterId !== undefined) {
          try {
            const zoom = await (map.getSource('pois') as maplibregl.GeoJSONSource).getClusterExpansionZoom(clusterId);
            map.easeTo({ center: (features[0].geometry as unknown as { coordinates: [number, number] }).coordinates.slice() as [number, number], zoom });
          } catch { /* ignore */ }
        }
      });

      // Click on POI
      map.on('click', 'unclustered-point', (e) => {
        const props = e.features?.[0]?.properties;
        if (props) {
          setSelectedPlace({
            id: props.id,
            text: props.name,
            place_name: props.name,
            center: (e.features[0].geometry as unknown as { coordinates: [number, number] }).coordinates.slice() as [number, number],
            place_type: [props.category],
          });
        }
      });

      // Route source (empty initially)
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#4285F4', 'line-width': 6, 'line-opacity': 0.8 },
      });

      routeLayerAdded.current = true;
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fly to geolocation
  useEffect(() => {
    if (geo.position && mapRef.current) {
      mapRef.current.flyTo({ center: [geo.position.lng, geo.position.lat], zoom: 14 });
      // Add user marker
      new maplibregl.Marker({ color: '#4285F4' })
        .setLngLat([geo.position.lng, geo.position.lat])
        .addTo(mapRef.current);
    }
  }, [geo.position]);

  // Search handler
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await geocodeSearch(searchQuery);
      setSearchResults(results);
      setShowSearch(true);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // Select a search result
  const selectResult = useCallback((result: SearchResult) => {
    if (mapRef.current) {
      mapRef.current.flyTo({ center: result.center, zoom: 15 });

      // Clear old markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const marker = new maplibregl.Marker({ color: '#EA4335' })
        .setLngLat(result.center)
        .setPopup(new maplibregl.Popup().setHTML(`<strong>${result.text}</strong><br/><small>${result.place_name}</small>`))
        .addTo(mapRef.current);

      markersRef.current.push(marker);
      marker.togglePopup();
    }
    setSelectedPlace(result);
    setShowSearch(false);
  }, []);

  // Start routing from a place
  const startRoutingFrom = useCallback((place: SearchResult) => {
    setRoutingMode(true);
    setRouteFrom(place.center);
    setRouteTo(null);
    setRouteData(null);
    setShowSearch(false);

    if (mapRef.current) {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const marker = new maplibregl.Marker({ color: '#34A853' })
        .setLngLat(place.center)
        .addTo(mapRef.current);
      markersRef.current.push(marker);
    }
  }, []);

  // Set destination for routing
  const setDestination = useCallback(async (place: SearchResult) => {
    if (!routeFrom) return;
    setRouteTo(place.center);
    setRoutingLoading(true);

    if (mapRef.current) {
      const marker = new maplibregl.Marker({ color: '#EA4335' })
        .setLngLat(place.center)
        .addTo(mapRef.current);
      markersRef.current.push(marker);
    }

    try {
      const route = await fetchRoute(routeFrom, place.center);
      if (route && mapRef.current) {
        setRouteData(route);
        const source = mapRef.current.getSource('route') as maplibregl.GeoJSONSource;
        source.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: route.geometry },
          properties: {},
        });

        // Fit map to route
        const bounds = new maplibregl.LngLatBounds();
        route.geometry.forEach((c) => bounds.extend(c as [number, number]));
        mapRef.current.fitBounds(bounds, { padding: 60 });
      }
    } finally {
      setRoutingLoading(false);
    }
  }, [routeFrom]);

  // Clear route
  const clearRoute = useCallback(() => {
    setRoutingMode(false);
    setRouteFrom(null);
    setRouteTo(null);
    setRouteData(null);
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (mapRef.current) {
      const source = mapRef.current.getSource('route') as maplibregl.GeoJSONSource;
      source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
    }
  }, []);

  const categoryIcon: Record<string, string> = {
    park: '🌳',
    landmark: '🏛️',
    transit: '🚉',
    food: '🍽️',
    neighborhood: '🏘️',
    museum: '🎨',
    venue: '🏟️',
  };

  return (
    <ThemeProvider><NotificationProvider userId="demo-user"><AppShell activeApp="maps" notifications={<><ThemeToggle/><NotificationBell/></>}>
    <div className="relative h-full w-full overflow-hidden">
      {/* Map container */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Search bar */}
      <div className="absolute top-4 left-4 z-10 w-80">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center px-3">
            <svg className="w-5 h-5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search places..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full px-3 py-3 text-sm outline-none"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]); setShowSearch(false); }} className="text-gray-400 hover:text-gray-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
            <button onClick={handleSearch} className="ml-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
              Search
            </button>
          </div>
        </div>

        {/* Search results dropdown */}
        {showSearch && searchResults.length > 0 && (
          <div className="mt-1 bg-white rounded-xl shadow-lg border border-gray-200 max-h-72 overflow-auto">
            {searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => selectResult(r)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0"
              >
                <p className="text-sm font-medium text-gray-900 truncate">{r.text}</p>
                <p className="text-xs text-gray-500 truncate">{r.place_name}</p>
              </button>
            ))}
          </div>
        )}
        {showSearch && searching && (
          <div className="mt-1 bg-white rounded-xl shadow-lg border border-gray-200 p-4 text-center">
            <div className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* My Location button */}
      <div className="absolute top-4 right-14 z-10">
        <button
          onClick={geo.requestLocation}
          disabled={geo.loading}
          className={cn(
            'w-10 h-10 bg-white rounded-lg shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors',
            geo.loading && 'opacity-50 cursor-wait'
          )}
          title="My Location"
        >
          {geo.loading ? (
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
              <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          )}
        </button>
      </div>

      {/* Routing banner */}
      {routingMode && (
        <div className="absolute top-20 left-4 z-10 bg-white rounded-xl shadow-lg border border-blue-200 p-3 w-80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">
              {routeTo ? 'Route calculated' : 'Select destination on map or search'}
            </span>
            <button onClick={clearRoute} className="text-xs text-red-500 hover:text-red-700">Cancel</button>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <span className="truncate">Origin set</span>
          </div>
          {routeTo && (
            <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span className="truncate">Destination set</span>
            </div>
          )}
          {routingLoading && (
            <div className="mt-2 flex items-center gap-2 text-xs text-blue-600">
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Calculating route...
            </div>
          )}
        </div>
      )}

      {/* Route instructions panel */}
      {routeData && !routingLoading && (
        <div className="absolute bottom-4 left-4 z-10 bg-white rounded-xl shadow-lg border border-gray-200 p-4 w-80 max-h-64 overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-lg font-bold text-gray-900">
                {formatDuration(routeData.legs[0]?.duration ?? 0)}
              </span>
              <span className="text-sm text-gray-500 ml-2">
                {formatDistance(routeData.legs[0]?.distance ?? 0)}
              </span>
            </div>
            <button onClick={clearRoute} className="text-xs text-red-500 hover:text-red-700">Clear</button>
          </div>
          <div className="space-y-2">
            {routeData.legs[0]?.steps.filter((s) => s.distance > 10).map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-sm mt-0.5">
                  {step.maneuver.type === 'turn' ? '↱' : step.maneuver.type === 'depart' ? '🏁' : step.maneuver.type === 'arrive' ? '📍' : '→'}
                </span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-gray-800">{step.name || 'Continue'}</p>
                  <p className="text-xs text-gray-500">{formatDistance(step.distance)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mobile slide-up sheet for selected place */}
      <SlideUpSheet
        isOpen={!!selectedPlace && !routingMode}
        onClose={() => setSelectedPlace(null)}
        title={selectedPlace?.text}
      >
        {selectedPlace && (
          <div>
            <p className="text-xs text-gray-500 mb-3">{selectedPlace.place_name}</p>
            <div className="flex gap-2">
              <button
                onClick={() => startRoutingFrom(selectedPlace)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12h4l3-9 4 18 3-9h4" />
                </svg>
                Directions
              </button>
              <button
                onClick={() => {
                  if (mapRef.current) {
                    mapRef.current.flyTo({ center: selectedPlace.center, zoom: 17 });
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200"
              >
                Zoom In
              </button>
            </div>

            {/* If in routing mode and origin is set, offer "Set as destination" */}
            {routeFrom && (
              <button
                onClick={() => setDestination(selectedPlace)}
                className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700"
              >
                Set as Destination
              </button>
            )}
          </div>
        )}
      </SlideUpSheet>

      {/* Map type controls */}
      <div className="absolute bottom-4 right-4 z-10 bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        <div className="p-1 flex flex-col gap-0.5">
          <button
            onClick={() => {
              if (mapRef.current) mapRef.current.setStyle(mapStyle);
            }}
            className="px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-100 rounded"
          >
            Standard
          </button>
          <button
            onClick={() => {
              if (mapRef.current) mapRef.current.setStyle('https://demotiles.maplibre.org/style.json');
            }}
            className="px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-100 rounded"
          >
            Demo
          </button>
        </div>
      </div>
    </div>
    </AppShell></NotificationProvider></ThemeProvider>
  );
}
