import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { reverseGeocode, ReverseGeoResult } from '../geocode';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface LocationPickerProps {
  /** Initial position (defaults to Kraków Main Square) */
  initialLat?: number;
  initialLng?: number;
  onConfirm: (lat: number, lng: number, address: string) => void;
  onCancel: () => void;
}

export function LocationPicker({ initialLat, initialLng, onConfirm, onCancel }: LocationPickerProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [lat, setLat] = useState(initialLat || 50.0647);
  const [lng, setLng] = useState(initialLng || 19.9450);
  const [address, setAddress] = useState('');
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const map = L.map('location-picker-map').setView([lat, lng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Draggable marker
    const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      setLat(pos.lat);
      setLng(pos.lng);
      resolveAddress(pos.lat, pos.lng);
    });

    // Click on map moves marker
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      setLat(e.latlng.lat);
      setLng(e.latlng.lng);
      resolveAddress(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    // Resolve initial address
    resolveAddress(lat, lng);

    return () => {
      map.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function resolveAddress(lat: number, lng: number) {
    setResolving(true);
    const result = await reverseGeocode(lat, lng);
    if (result) {
      setAddress(result.displayName);
    } else {
      setAddress('');
    }
    setResolving(false);
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 2000,
      background: '#fff',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        background: '#FFF8F0',
        borderBottom: '2px solid rgba(255,107,107,0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        <button
          onClick={onCancel}
          style={{
            border: 'none',
            background: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            padding: '4px',
            color: '#2C3E50',
          }}
        >
          ✕
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '14px', color: '#2C3E50' }}>
            Wybierz lokalizację
          </div>
          {resolving && (
            <div style={{ fontSize: '12px', color: '#999' }}>Sprawdzanie adresu...</div>
          )}
          {!resolving && address && (
            <div style={{ fontSize: '12px', color: '#7F8C8D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📍 {address}
            </div>
          )}
          {!resolving && !address && (
            <div style={{ fontSize: '12px', color: '#999' }}>
              Kliknij na mapie lub przeciągnij pinezkę
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div id="location-picker-map" style={{ flex: 1, minHeight: 0 }} />

      {/* Coordinates display */}
      <div style={{
        padding: '8px 16px',
        background: '#FFF0E0',
        textAlign: 'center',
        fontSize: '13px',
        color: '#555',
        fontFamily: 'monospace',
        flexShrink: 0,
      }}>
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </div>

      {/* Confirm button */}
      <div style={{ padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', flexShrink: 0 }}>
        <button
          class="btn btn-primary"
          onClick={() => onConfirm(lat, lng, address)}
        >
          ✅ Potwierdź lokalizację
        </button>
      </div>
    </div>
  );
}
