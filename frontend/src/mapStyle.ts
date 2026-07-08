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

export function mapTiles(dark: boolean): TileLayerOpts {
  if (dark) {
    return {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 20,
    };
  }
  return {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
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