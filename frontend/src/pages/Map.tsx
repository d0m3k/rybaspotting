import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api';
import { distanceMeters } from '../distance';
import { loadAuth } from '../stores/auth';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Three-state fish icons for map markers: default, spotted by you, collected by you
function makeFishIcon(bodyColor: string, strokeColor: string, finColor: string, cheekColor: string) {
  // Each instance needs a unique filter id to avoid SVG id collisions
  const fid = `fs${Math.random().toString(36).slice(2, 7)}`;
  const html = `
<svg width="40" height="40" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <ellipse cx="55" cy="50" rx="33" ry="44" fill="white" opacity="0.25" filter="url(#${fid})"/>
  <polygon points="15,50 0,35 10,50 0,65" fill="${finColor}" stroke="${strokeColor}" stroke-width="2"/>
  <ellipse cx="55" cy="50" rx="35" ry="22" fill="${bodyColor}" stroke="${strokeColor}" stroke-width="2.5"/>
  <ellipse cx="82" cy="42" rx="12" ry="10" fill="${cheekColor}" stroke="${strokeColor}" stroke-width="1.5"/>
  <ellipse cx="82" cy="58" rx="12" ry="10" fill="${cheekColor}" stroke="${strokeColor}" stroke-width="1.5"/>
  <line x1="82" y1="47" x2="82" y2="53" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="32" cy="45" r="7" fill="white" stroke="#333" stroke-width="1.5"/>
  <circle cx="34" cy="44" r="3.5" fill="#222"/>
  <polygon points="45,28 55,8 70,28" fill="${finColor}" stroke="${strokeColor}" stroke-width="2" fill-opacity="0.85"/>
</svg>`;
  return L.divIcon({
    className: 'fish-marker-icon',
    html,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
}

function fishMarkerIcon(fish: any, userId: number | undefined, collectedIds: Set<number>) {
  if (userId != null && fish.spotted_by === userId) return makeFishIcon('#FFE66D', '#D4AC0D', '#F1C40F', '#FFF3B0');
  if (collectedIds.has(fish.id)) return makeFishIcon('#58D68D', '#1E8449', '#2ECC71', '#A9DFBF');
  return makeFishIcon('#FF8E72', '#C0392B', '#FF6B6B', '#FFB3A7');
}

export function MapPage({ onStatsChanged, userId, username, dark }: { onStatsChanged?: () => void; userId?: number; username?: string; dark?: boolean }) {
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [fishList, setFishList] = useState<any[]>([]);
  const [selectedFish, setSelectedFish] = useState<any | null>(null);
  const [fishDetail, setFishDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [collectedFishIds, setCollectedFishIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const map = L.map('map').setView([50.0647, 19.9450], 13);
    mapRef.current = map;

    loadFish();
    loadMyCollections();

    return () => {
      map.remove();
    };
  }, []);

  // Tile layer follows the app dark mode. CartoDB provides free OSM-based dark
  // tiles; light uses the standard OSM layer. Swapping rather than CSS-filtering
  // keeps the fish markers/popups at their designed colours.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
      tileRef.current = null;
    }
    const url = dark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const attr = dark
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      : '&copy; OpenStreetMap contributors';
    const tile = L.tileLayer(url, { attribution: attr, maxZoom: 19 });
    tile.addTo(map);
    tileRef.current = tile;
    return () => {
      if (tileRef.current) {
        map.removeLayer(tileRef.current);
        tileRef.current = null;
      }
    };
  }, [dark]);

  useEffect(() => {
    // Rebuild markers when the relationship set changes
    if (fishList.length > 0) {
      updateMarkers(fishList);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectedFishIds]);

  async function loadMyCollections() {
    try {
      const colls = await api.getMyCollections();
      setCollectedFishIds(new Set(colls.map((c: any) => Number(c.id))));
    } catch { /* ignore */ }
  }

  async function loadFish() {
    setLoading(true);
    try {
      const fish = await api.listFish();
      setFishList(fish);
      updateMarkers(fish);
    } catch (err) {
      console.error('Failed to load fish', err);
    } finally {
      setLoading(false);
    }
  }

  function updateMarkers(fish: any[]) {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    fish.forEach(f => {
      const marker = L.marker([f.latitude, f.longitude], { icon: fishMarkerIcon(f, userId, collectedFishIds) })
        .addTo(map)
        .on('click', async () => {
          setSelectedFish(f);
          setFishDetail(null);
          setDetailLoading(true);
          try {
            const detail = await api.getFish(f.id);
            setFishDetail(detail);
          } catch (err) {
            console.error('Failed to load fish detail', err);
            setFishDetail(null);
          } finally {
            setDetailLoading(false);
          }
        });
      markersRef.current.push(marker);
    });
  }

  async function handleCollect(fishId: number, fishLat: number, fishLng: number) {
    const auth = loadAuth();
    const isAdmin = auth?.isAdmin ?? false;

    // Check 50m radius (admins bypass this)
    if (!isAdmin) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 30000,
          });
        });
        const dist = distanceMeters(pos.coords.latitude, pos.coords.longitude, fishLat, fishLng);
        if (isNaN(dist) || dist > 50) {
          alert(`Jesteś za daleko! (${isNaN(dist) ? '?' : dist.toFixed(0)}m od ryby, max 50m). Podejdź bliżej.`);
          return;
        }
      } catch {
        alert('Nie można sprawdzić Twojej lokalizacji. Włącz GPS aby zebrać rybę.');
        return;
      }
    }

    const ok = window.confirm('Czy na pewno jesteś na miejscu i chcesz zebrać tę rybę? 🎣');
    if (!ok) return;

    try {
      await api.collect(fishId);
      if (onStatsChanged) onStatsChanged();
      // Track locally so the marker turns green immediately
      setCollectedFishIds(prev => new Set(prev).add(Number(fishId)));
      // Optimistically update the bottom sheet so the button disappears instantly
      setFishDetail((prev: any) => {
        if (!prev) return prev;
        const alreadyThere = prev.collectors?.some((c: any) => c.username === username);
        if (alreadyThere) return prev;
        return {
          ...prev,
          collectors: [...(prev.collectors || []), { username: username, collected_at: new Date().toISOString() }],
        };
      });
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div class="map-page">
      <div id="map" class="map-container"></div>
      {loading && <div class="map-loading">Ładowanie...</div>}

      <div class="map-legend">
        <span class="map-legend-item"><span class="map-legend-dot" style="background:#FF8E72;border-color:#C0392B;"></span> do zebrania</span>
        <span class="map-legend-item"><span class="map-legend-dot" style="background:#FFE66D;border-color:#D4AC0D;"></span> Twoja</span>
        <span class="map-legend-item"><span class="map-legend-dot" style="background:#58D68D;border-color:#1E8449;"></span> zebrana</span>
      </div>

      {selectedFish && (() => {
        const isOwnFish = userId != null && selectedFish.spotted_by === userId;
        const hasCollected = collectedFishIds.has(Number(selectedFish.id)) ||
          (fishDetail?.collectors?.some((c: any) => c.username === username) ?? false);
        const canCollect = !isOwnFish && !hasCollected && !detailLoading;

        return (
        <div class="bottom-sheet">
          <button class="close-btn" onClick={() => { setSelectedFish(null); setFishDetail(null); }}>✕</button>
          <img
            src={selectedFish.photo_url || `/api/photos/${selectedFish.photo_filename}`}
            alt="Ryba"
            class="fish-preview"
          />
          <p class="fish-spotter">🐟 Spotter: {selectedFish.spotter_name}</p>
          <p class="fish-date">
            📅 {new Date(selectedFish.created_at).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          {selectedFish.address_hint ? (
            <p class="fish-address">📍 {selectedFish.address_hint}</p>
          ) : (
            <p class="fish-coords">
              {selectedFish.latitude.toFixed(5)}, {selectedFish.longitude.toFixed(5)}
            </p>
          )}
          <p class="fish-collectors">
            {detailLoading ? (
              'Ładowanie…'
            ) : fishDetail?.collectors?.length > 0 ? (
              <>
                🎣 Zebrana {fishDetail.collectors.length}× — {fishDetail.collectors.map((c: any) => c.username).join(', ')}
                <br /><span class="fish-last-collected">
                  Ostatnio: {new Date(fishDetail.collectors[fishDetail.collectors.length - 1].collected_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </>
            ) : (
              '🎣 Brak zbieraczy'
            )}
          </p>
          {isOwnFish && (
            <p class="fish-note">📸 To Twoja ryba — jesteś jej spotterem!</p>
          )}
          {hasCollected && (
            <p class="fish-note">✅ Już zebrałeś tę rybę</p>
          )}
          {canCollect && (
            <button
              class="btn btn-primary"
              onClick={() => handleCollect(selectedFish.id, selectedFish.latitude, selectedFish.longitude)}
            >
              Collect! 🎣
            </button>
          )}
        </div>
        );
      })()}
    </div>
  );
}
