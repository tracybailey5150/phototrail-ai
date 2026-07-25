export interface GeocodedLocation {
  placeName: string | null;
  landmark: string | null;
  streetAddress: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  countryCode: string | null;
  neighborhood: string | null;
  timezone: string | null;
  raw: Record<string, unknown>;
  provider: string;
}

/**
 * Reverse geocode coordinates using OpenStreetMap Nominatim (free, no API key).
 * Abstraction layer — swap provider by changing this function.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<GeocodedLocation | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PhotoTrailAI/1.0 (tracybailey5150@icloud.com)' },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.error) return null;

    const addr = data.address || {};

    return {
      placeName: data.name || data.display_name?.split(',')[0] || null,
      landmark: addr.tourism || addr.historic || addr.amenity || null,
      streetAddress: [addr.house_number, addr.road].filter(Boolean).join(' ') || null,
      city: addr.city || addr.town || addr.village || addr.municipality || null,
      stateProvince: addr.state || addr.province || null,
      postalCode: addr.postcode || null,
      country: addr.country || null,
      countryCode: addr.country_code?.toUpperCase() || null,
      neighborhood: addr.suburb || addr.neighbourhood || null,
      timezone: null, // Nominatim doesn't provide timezone
      raw: data,
      provider: 'nominatim',
    };
  } catch {
    return null;
  }
}

/**
 * Look up timezone from coordinates using a free timezone API.
 */
export async function lookupTimezone(lat: number, lon: number): Promise<{ timezone: string; utcOffset: number } | null> {
  try {
    const url = `https://timeapi.io/api/timezone/coordinate?latitude=${lat}&longitude=${lon}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      timezone: data.timeZone || null,
      utcOffset: data.currentUtcOffset?.totalMinutes ?? 0,
    };
  } catch {
    return null;
  }
}
