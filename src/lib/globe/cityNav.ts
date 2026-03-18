import { CITIES_BY_COUNTRY, type City } from "./cities";

export interface CityLookup extends City {
  slug: string;
  countryIso: string;
}

// Build a flat map: slug → city info
let _cache: Map<string, CityLookup> | null = null;

export function getCitySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function getAllCities(): Map<string, CityLookup> {
  if (_cache) return _cache;
  _cache = new Map<string, CityLookup>();
  for (const [iso, cities] of Object.entries(CITIES_BY_COUNTRY)) {
    for (const city of cities) {
      const slug = getCitySlug(city.name);
      _cache.set(slug, { ...city, slug, countryIso: iso });
    }
  }
  return _cache;
}

export function lookupCity(slug: string): CityLookup | null {
  return getAllCities().get(slug) ?? null;
}

export function buildAirspaceUrl(city: City): string {
  const slug = getCitySlug(city.name);
  const params = new URLSearchParams({
    lat: city.lat.toFixed(5),
    lng: city.lng.toFixed(5),
    name: city.name,
  });
  return `/airspace/${slug}?${params.toString()}`;
}
