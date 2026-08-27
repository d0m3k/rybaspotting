// Single source of truth for map tiles across the app (main map, location
// picker on Spot/Upload, location preview). Keeps light/dark a *paired* style
// family (same CARTO minimal generalist style, two themes) so the two modes
// look like one design in two tones — not two unrelated maps.
//
// Swap this file's URLs to change providers (e.g. MapTiler "Topo" light/dark,
// which is the closest free Organic-Maps look but needs an API key).

export interface TileLayerOpts {
  url: string;
  attribution: string;
  maxZoom: number;
}

// CARTO basemaps now require an API key (https://carto.com/basemaps/apikey/).
// The key is public by design (it ships in the tile URL) and is scoped per
// domain by CARTO. Set VITE_CARTO_KEY at build time (locally via frontend/.env,
// in CI via the VITE_CARTO_KEY GitHub Actions secret — see build.yml).
const CARTO_KEY = (import.meta.env.VITE_CARTO_KEY as string | undefined)?.trim();

function cartoUrl(style: string): string {
  const base = `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
  return CARTO_KEY ? `${base}?key=${encodeURIComponent(CARTO_KEY)}` : base;
}

// Attribution required by the CARTO basemaps terms and the ODbL — must stay
// visible on every map instance (main map, picker, preview).
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function mapTiles(dark: boolean): TileLayerOpts {
  if (dark) {
    return {
      url: cartoUrl('dark_all'),
      attribution: ATTRIBUTION,
      maxZoom: 20,
    };
  }
  return {
    url: cartoUrl('light_all'),
    attribution: ATTRIBUTION,
    maxZoom: 20,
  };
}

// For components that don't receive the `dark` prop (location picker/preview on
// the Spot & Upload pages) — read the theme from the <html> class that App.tsx
// toggles. Reads at mount; toggling theme while the picker is open won't retile
// until reopened (acceptable, matches expectations).
export function appDark(): boolean {
  return document.documentElement.classList.contains('dark');
}