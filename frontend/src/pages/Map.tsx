import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom fish icon for map markers
const fishIconHtml = `
<svg width="40" height="40" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="fishShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <ellipse cx="55" cy="50" rx="33" ry="44" fill="white" opacity="0.25" filter="url(#fishShadow)"/>
  <polygon points="15,50 0,35 10,50 0,65" fill="#FF6B6B" stroke="#C0392B" stroke-width="2"/>
  <ellipse cx="55" cy="50" rx="35" ry="22" fill="#FF8E72" stroke="#C0392B" stroke-width="2.5"/>
  <ellipse cx="82" cy="42" rx="12" ry="10" fill="#FFB3A7" stroke="#C0392B" stroke-width="1.5"/>
  <ellipse cx="82" cy="58" rx="12" ry="10" fill="#FFB3A7" stroke="#C0392B" stroke-width="1.5"/>
  <line x1="82" y1="47" x2="82" y2="53" stroke="#C0392B" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="32" cy="45" r="7" fill="white" stroke="#333" stroke-width="1.5"/>
  <circle cx="34" cy="44" r="3.5" fill="#222"/>
  <polygon points="45,28 55,8 70,28" fill="#FF6B6B" stroke="#C0392B" stroke-width="2" fill-opacity="0.85"/>
</svg>`;

const fishIcon = L.divIcon({
  className: 'fish-marker-icon',
  html: fishIconHtml,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

export function MapPage({ onStatsChanged }: { onStatsChanged?: () => void }) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [fishList, setFishList] = useState<any[]>([]);
  const [selectedFish, setSelectedFish] = useState<any | null>(null);
  const [fishDetail, setFishDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const map = L.map('map').setView([50.0647, 19.9450], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;

    loadFish();

    return () => {
      map.remove();
    };
  }, []);

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
      const marker = L.marker([f.latitude, f.longitude], { icon: fishIcon })
        .addTo(map)
        .on('click', async () => {
          setSelectedFish(f);
          setFishDetail(null);
          setDetailLoading(true);
          try {
            const detail = await api.getFish(f.id);
            setFishDetail(detail);
          } catch {
            setFishDetail(null);
          } finally {
            setDetailLoading(false);
          }
        });
      markersRef.current.push(marker);
    });
  }

  async function handleCollect(fishId: number) {
    const ok = window.confirm('Czy na pewno jesteś na miejscu i chcesz zebrać tę rybę? 🎣');
    if (!ok) return;

    try {
      await api.collect(fishId);
      if (onStatsChanged) onStatsChanged();
      alert('Zebrane! 🐟');
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div class="map-page">
      <div id="map" class="map-container"></div>
      {loading && <div class="map-loading">Ładowanie...</div>}

      {selectedFish && (
        <div class="bottom-sheet">
          <button class="close-btn" onClick={() => { setSelectedFish(null); setFishDetail(null); }}>✕</button>
          <img
            src={`/api/photos/${selectedFish.photo_filename}`}
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
            ) : fishDetail?.collectors ? (
              <>🎣 Zebrana {fishDetail.collectors.length}× — {fishDetail.collectors.map((c: any) => c.username).join(', ')}</>
            ) : (
              '🎣 Brak zbieraczy'
            )}
          </p>
          <button
            class="btn btn-primary"
            onClick={() => handleCollect(selectedFish.id)}
          >
            Collect! 🎣
          </button>
        </div>
      )}
    </div>
  );
}
