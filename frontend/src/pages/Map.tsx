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
<svg width="36" height="36" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <polygon points="15,50 0,35 10,50 0,65" fill="#FF6B6B" stroke="#E55A5A" stroke-width="1.5"/>
  <ellipse cx="55" cy="50" rx="35" ry="22" fill="#FF8E72" stroke="#E57A5E" stroke-width="1.5"/>
  <ellipse cx="82" cy="42" rx="12" ry="10" fill="#FFB3A7" stroke="#E57A5E" stroke-width="1"/>
  <ellipse cx="82" cy="58" rx="12" ry="10" fill="#FFB3A7" stroke="#E57A5E" stroke-width="1"/>
  <line x1="82" y1="47" x2="82" y2="53" stroke="#E57A5E" stroke-width="1" stroke-linecap="round"/>
  <circle cx="32" cy="45" r="6" fill="white" stroke="#333" stroke-width="1"/>
  <circle cx="34" cy="44" r="3" fill="#333"/>
  <polygon points="45,28 55,10 70,28" fill="#FF6B6B" stroke="#E55A5A" stroke-width="1" fill-opacity="0.8"/>
</svg>`;

const fishIcon = L.divIcon({
  className: 'fish-marker-icon',
  html: fishIconHtml,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

export function MapPage() {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [fishList, setFishList] = useState<any[]>([]);
  const [selectedFish, setSelectedFish] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

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
        .on('click', () => {
          setSelectedFish(f);
        });
      markersRef.current.push(marker);
    });
  }

  async function handleCollect(fishId: number) {
    const ok = window.confirm('Czy na pewno jesteś na miejscu i chcesz zebrać tę rybę? 🎣');
    if (!ok) return;

    try {
      await api.collect(fishId);
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
          <button class="close-btn" onClick={() => setSelectedFish(null)}>✕</button>
          <img
            src={`/api/photos/${selectedFish.photo_filename}`}
            alt="Ryba"
            class="fish-preview"
          />
          <p class="fish-spotter">🐟 Spotter: {selectedFish.spotter_name}</p>
          <p class="fish-coords">
            {selectedFish.latitude.toFixed(5)}, {selectedFish.longitude.toFixed(5)}
          </p>
          {selectedFish.address_hint && (
            <p class="fish-address">{selectedFish.address_hint}</p>
          )}
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
