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
      const marker = L.marker([f.latitude, f.longitude])
        .addTo(map)
        .on('click', () => {
          setSelectedFish(f);
        });
      markersRef.current.push(marker);
    });
  }

  async function handleCollect(fishId: number) {
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
