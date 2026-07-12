import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api';
import { distanceMeters } from '../distance';
import { loadAuth } from '../stores/auth';
import { mapTiles } from '../mapStyle';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Clustering ────────────────────────────────────────────────────────────────

const CLUSTER_GRID_PX = 70; // max pixels between markers before they merge into a cluster

interface FishCluster {
  center: [number, number];
  fish: any[];
  count: number;
}

interface EdgeIndicator {
  latlng: [number, number];
  count: number;
}

/** Grid-based clustering in pixel space at the current zoom level. */
function clusterFish(fishList: any[], map: L.Map): { clusters: FishCluster[]; singles: any[] } {
  const grid = new Map<string, any[]>();

  for (const f of fishList) {
    const pt = map.latLngToContainerPoint([f.latitude, f.longitude]);
    const cx = Math.floor(pt.x / CLUSTER_GRID_PX);
    const cy = Math.floor(pt.y / CLUSTER_GRID_PX);
    const key = `${cx},${cy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(f);
  }

  const clusters: FishCluster[] = [];
  const singles: any[] = [];

  for (const [, group] of grid) {
    if (group.length === 1) {
      singles.push(group[0]);
    } else {
      let sumLat = 0, sumLng = 0;
      for (const f of group) { sumLat += f.latitude; sumLng += f.longitude; }
      clusters.push({
        center: [sumLat / group.length, sumLng / group.length],
        fish: group,
        count: group.length,
      });
    }
  }

  return { clusters, singles };
}

/** Compute off-screen indicators — one per 45° sector, placed on the viewport edge. */
function computeEdgeIndicators(fishList: any[], map: L.Map): EdgeIndicator[] {
  const bounds = map.getBounds();
  const pad = 0.0005; // tiny inset so barely-in-view fish don't trigger arrows
  const south = bounds.getSouth() + pad;
  const north = bounds.getNorth() - pad;
  const west = bounds.getWest() + pad;
  const east = bounds.getEast() - pad;

  // Group out-of-bounds fish by 45° sector (0=N, 1=NE, …, 7=NW)
  const sectors: Map<number, any[]> = new Map();

  for (const f of fishList) {
    const lat = f.latitude;
    const lng = f.longitude;
    if (lat >= south && lat <= north && lng >= west && lng <= east) continue; // in view

    // Bearing from map center to fish (0° = north, clockwise)
    const center = bounds.getCenter();
    const dLng = lng - center.lng;
    const dLat = lat - center.lat;
    let bearing = (Math.atan2(dLng, dLat) * 180) / Math.PI;
    if (bearing < 0) bearing += 360;

    const sector = Math.floor(((bearing + 22.5) % 360) / 45);
    if (!sectors.has(sector)) sectors.set(sector, []);
    sectors.get(sector)!.push(f);
  }

  const indicators: EdgeIndicator[] = [];
  for (const [, group] of sectors) {
    // Average position of fish in this sector
    let sumLat = 0, sumLng = 0;
    for (const f of group) { sumLat += f.latitude; sumLng += f.longitude; }
    const avgLat = sumLat / group.length;
    const avgLng = sumLng / group.length;

    // Clamp to viewport edge → the closest point on the bounding rect
    const clampLat = Math.max(south, Math.min(north, avgLat));
    const clampLng = Math.max(west, Math.min(east, avgLng));

    indicators.push({ latlng: [clampLat, clampLng], count: group.length });
  }

  return indicators;
}

// ── Marker icon factories ─────────────────────────────────────────────────────

// Three-state fish icons for map markers: default, spotted by you, collected by you
function makeFishIcon(bodyColor: string, strokeColor: string, finColor: string, cheekColor: string) {
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

/** Cluster marker — a circle with the fish count. Size grows with count. */
function makeClusterIcon(count: number): L.DivIcon {
  let size = 42;
  let fontSize = 15;
  if (count >= 10) { size = 50; fontSize = 16; }
  if (count >= 25) { size = 58; fontSize = 18; }
  if (count >= 100) { size = 64; fontSize = 16; }

  const html = `<div style="
    width:${size}px;height:${size}px;
    background:linear-gradient(135deg,#FF6B6B,#FF8E72);
    border:3px solid #fff;
    border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    color:#fff;font-weight:700;font-size:${fontSize}px;
    box-shadow:0 2px 8px rgba(0,0,0,0.3);
    filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35));
    font-family:-apple-system,BlinkMacSystemFont,sans-serif;
  ">${count}</div>`;

  return L.divIcon({
    className: 'cluster-marker-icon',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Edge indicator — teal arrow marker pointing towards off-screen fish. */
function makeEdgeIcon(count: number): L.DivIcon {
  const size = 30;
  const html = `<div style="
    width:${size}px;height:${size}px;
    background:rgba(78,205,196,0.92);
    border:2px solid #fff;
    border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    color:#fff;font-size:11px;font-weight:700;
    box-shadow:0 1px 6px rgba(0,0,0,0.3);
    font-family:-apple-system,BlinkMacSystemFont,sans-serif;
  ">${count}</div>`;

  return L.divIcon({
    className: 'edge-arrow-icon',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const CLUSTER_PAGE_SIZE = 5;

export function MapPage({ onStatsChanged, userId, username, dark }: { onStatsChanged?: () => void; userId?: number; username?: string; dark?: boolean }) {
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<L.Layer[]>([]);
  const [fishList, setFishList] = useState<any[]>([]);
  const [selectedFish, setSelectedFish] = useState<any | null>(null);
  const [fishDetail, setFishDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [collectedFishIds, setCollectedFishIds] = useState<Set<number>>(new Set());

  // Cluster detail sheet state
  const [clusterDetail, setClusterDetail] = useState<FishCluster | null>(null);
  const [clusterPage, setClusterPage] = useState(0);

  useEffect(() => {
    const map = L.map('map').setView([50.0647, 19.9450], 13);
    mapRef.current = map;

    loadFish();
    loadMyCollections();

    return () => {
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tile layer follows the app dark mode.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
      tileRef.current = null;
    }
    const opts = mapTiles(!!dark);
    const tile = L.tileLayer(opts.url, { attribution: opts.attribution, maxZoom: opts.maxZoom });
    tile.addTo(map);
    tileRef.current = tile;
    return () => {
      if (tileRef.current) {
        map.removeLayer(tileRef.current);
        tileRef.current = null;
      }
    };
  }, [dark]);

  // ── Render markers with clustering ──────────────────────────────────────

  const renderAllMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || fishList.length === 0) return;

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Cluster
    const { clusters, singles } = clusterFish(fishList, map);

    // Render single-fish markers
    for (const f of singles) {
      const marker = L.marker([f.latitude, f.longitude], {
        icon: fishMarkerIcon(f, userId, collectedFishIds),
      })
        .addTo(map)
        .on('click', async () => {
          setClusterDetail(null);
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
    }

    // Render cluster markers
    for (const cl of clusters) {
      const marker = L.marker(cl.center, { icon: makeClusterIcon(cl.count) })
        .addTo(map)
        .on('click', () => {
          setSelectedFish(null);
          setFishDetail(null);
          setClusterDetail(cl);
          setClusterPage(0);
        });
      markersRef.current.push(marker);
    }

    // Render edge indicators for off-screen fish
    const indicators = computeEdgeIndicators(fishList, map);
    for (const ind of indicators) {
      const marker = L.marker(ind.latlng, {
        icon: makeEdgeIcon(ind.count),
        interactive: false,
        keyboard: false,
      }).addTo(map);
      markersRef.current.push(marker);
    }
  }, [fishList, userId, collectedFishIds]);

  // Re-cluster when map moves or zooms (debounced via moveend/zoomend)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onViewChange = () => renderAllMarkers();
    map.on('moveend', onViewChange);
    map.on('zoomend', onViewChange);

    return () => {
      map.off('moveend', onViewChange);
      map.off('zoomend', onViewChange);
    };
  }, [renderAllMarkers]);

  // Re-cluster when fish data or collection status changes
  useEffect(() => {
    if (fishList.length > 0 && mapRef.current) {
      renderAllMarkers();
    }
  }, [fishList, collectedFishIds, renderAllMarkers]);

  async function loadMyCollections() {
    try {
      const colls = await api.getMyCollections();
      setCollectedFishIds(new Set(colls.map((c: any) => Number(c.id))));
    } catch { /* ignore */ }
  }

  async function loadFish() {
    setLoading(true);
    try {
      // Load up to 100 fish (max backend allows) so clustering is meaningful
      const fish = await api.listFish(1, 100);
      setFishList(fish);
    } catch (err) {
      console.error('Failed to load fish', err);
    } finally {
      setLoading(false);
    }
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

  // ── Paginated cluster fish ──────────────────────────────────────────────

  const clusterTotalPages = clusterDetail ? Math.ceil(clusterDetail.count / CLUSTER_PAGE_SIZE) : 0;
  const clusterPageFish = clusterDetail
    ? clusterDetail.fish.slice(clusterPage * CLUSTER_PAGE_SIZE, (clusterPage + 1) * CLUSTER_PAGE_SIZE)
    : [];

  function openFishFromCluster(f: any) {
    setClusterDetail(null);
    setSelectedFish(f);
    setFishDetail(null);
    setDetailLoading(true);
    api.getFish(f.id)
      .then(d => setFishDetail(d))
      .catch(() => setFishDetail(null))
      .finally(() => setDetailLoading(false));
  }

  return (
    <div class="map-page">
      <div id="map" class="map-container"></div>
      {loading && <div class="map-loading">Ładowanie...</div>}

      <div class="map-legend">
        <span class="map-legend-item"><span class="map-legend-dot" style="background:#FF8E72;border-color:#C0392B;"></span> do zebrania</span>
        <span class="map-legend-item"><span class="map-legend-dot" style="background:#FFE66D;border-color:#D4AC0D;"></span> Twoja</span>
        <span class="map-legend-item"><span class="map-legend-dot" style="background:#58D68D;border-color:#1E8449;"></span> zebrana</span>
        <span class="map-legend-item"><span class="map-legend-dot" style="background:linear-gradient(135deg,#FF6B6B,#FF8E72);border-color:#fff;border-radius:50%;"></span> grupa</span>
      </div>

      {/* ── Cluster detail bottom sheet ─────────────────────────────── */}
      {clusterDetail && (
        <div class="bottom-sheet">
          <button class="close-btn" onClick={() => setClusterDetail(null)}>✕</button>
          <h3 style="margin-bottom:4px;">🐟🐟 Grupa {clusterDetail.count} ryb</h3>
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">
            Strona {clusterPage + 1} z {clusterTotalPages}
          </p>

          <div class="cluster-fish-list">
            {clusterPageFish.map((f: any) => (
              <div
                key={f.id}
                class="cluster-fish-item"
                onClick={() => openFishFromCluster(f)}
              >
                <img
                  src={f.photo_url || `/api/photos/${f.photo_filename}`}
                  alt=""
                  class="cluster-fish-thumb"
                />
                <div class="cluster-fish-info">
                  <span class="cluster-fish-spotter">{f.spotter_name}</span>
                  <span class="cluster-fish-date">
                    {new Date(f.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {f.address_hint && <span class="cluster-fish-addr">{f.address_hint}</span>}
                </div>
                <span class="cluster-fish-arrow">›</span>
              </div>
            ))}
          </div>

          {clusterTotalPages > 1 && (
            <div class="cluster-pagination">
              <button
                class="btn btn-secondary"
                style="flex:1;padding:8px;"
                disabled={clusterPage === 0}
                onClick={() => setClusterPage(p => p - 1)}
              >
                ← Poprzednia
              </button>
              <button
                class="btn btn-secondary"
                style="flex:1;padding:8px;"
                disabled={clusterPage >= clusterTotalPages - 1}
                onClick={() => setClusterPage(p => p + 1)}
              >
                Następna →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Single fish bottom sheet ─────────────────────────────────── */}
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
