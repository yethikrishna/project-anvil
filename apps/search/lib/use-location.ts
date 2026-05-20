'use client';

import {useState, useEffect, useCallback} from 'react';

export interface UserLocation {
  lat: number;
  lon: number;
  accuracy?: number;
  city?: string;
  country?: string;
}

/**
 * Hook to get the user's current geolocation.
 * Caches the position in sessionStorage to avoid repeated prompts.
 */
export function useGeolocation(): {
  location: UserLocation | null;
  loading: boolean;
  error: string | null;
  requestLocation: () => void;
} {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check sessionStorage cache on mount
  useEffect(() => {
    const cached = sessionStorage.getItem('anvil-user-location');
    if (cached) {
      try {
        setLocation(JSON.parse(cached));
      } catch {
        sessionStorage.removeItem('anvil-user-location');
      }
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by your browser');
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const loc: UserLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };

        // Reverse geocode to get city/country
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${loc.lat}&lon=${loc.lon}&format=json&zoom=10`,
            {headers: {'Accept-Language': 'en'}}
          );
          const data = await resp.json();
          loc.city = data.address?.city ?? data.address?.town ?? data.address?.village ?? '';
          loc.country = data.address?.country ?? '';
        } catch {
          // Non-critical — location works without reverse geocoding
        }

        setLocation(loc);
        sessionStorage.setItem('anvil-user-location', JSON.stringify(loc));
        setLoading(false);
      },
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError('Location access denied');
            break;
          case err.POSITION_UNAVAILABLE:
            setError('Location unavailable');
            break;
          case err.TIMEOUT:
            setError('Location request timed out');
            break;
          default:
            setError('Failed to get location');
        }
        setLoading(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // Cache for 5 minutes
      }
    );
  }, []);

  return {location, loading, error, requestLocation};
}

/**
 * Generate location-based search suggestions.
 */
export function getLocationSuggestions(location: UserLocation | null): string[] {
  if (!location) return [];

  const city = location.city ?? 'your area';
  const suggestions: string[] = [
    `restaurants near ${city}`,
    `coffee shops near ${city}`,
    `hotels near ${city}`,
    `weather in ${city}`,
    `things to do in ${city}`,
    `gas stations near me`,
    `pharmacies near ${city}`,
    `parks near ${city}`,
  ];

  return suggestions;
}

/**
 * Detect if a query is location-based (contains "near me", "nearby", "close to", etc.)
 */
export function isLocationQuery(query: string): boolean {
  const patterns = [
    /\bnear\s+me\b/i,
    /\bnearby\b/i,
    /\bclose\s+to\b/i,
    /\baround\s+me\b/i,
    /\bin\s+my\s+area\b/i,
    /\blocal\b/i,
    /\bnear\s+\w+/i,
    /\bdirections\s+to\b/i,
  ];
  return patterns.some(p => p.test(query));
}

/**
 * Enhance a search query with location context.
 */
export function enhanceQueryWithLocation(query: string, location: UserLocation | null): string {
  if (!location) return query;
  if (!isLocationQuery(query)) return query;

  // If query is "near me", replace with "near [city]"
  if (/\bnear\s+me\b/i.test(query) && location.city) {
    return query.replace(/\bnear\s+me\b/i, `near ${location.city}`);
  }

  return query;
}
