// Reverse geocoding using Nominatim (OpenStreetMap, free, no API key)
// Rate-limited to 1 req/s as per their usage policy.

let lastRequest = 0;

export interface ReverseGeoResult {
  displayName: string;
  road?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeoResult | null> {
  // Respect Nominatim's 1 req/s rate limit
  const now = Date.now();
  const wait = Math.max(0, 1000 - (now - lastRequest));
  if (wait > 0) {
    await new Promise(r => setTimeout(r, wait));
  }
  lastRequest = Date.now();

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18&accept-language=pl`,
      {
        headers: {
          'User-Agent': 'Rybaspotting/1.0 (local dev)',
        },
      }
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (!data || data.error) return null;

    const addr = data.address || {};
    const parts: string[] = [];
    if (addr.road) parts.push(addr.road);
    if (addr.house_number) parts.push(addr.house_number);
    if (addr.city || addr.town || addr.village || addr.municipality) {
      parts.push(addr.city || addr.town || addr.village || addr.municipality);
    }

    return {
      displayName: data.display_name || parts.join(', '),
      road: addr.road || addr.pedestrian || addr.footway,
      city: addr.city || addr.town || addr.village || addr.municipality,
      postcode: addr.postcode,
      country: addr.country,
    };
  } catch {
    return null;
  }
}
