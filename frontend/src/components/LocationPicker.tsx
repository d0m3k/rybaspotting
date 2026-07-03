import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { reverseGeocode } from '../geocode';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface Props {
  initialLat?: number;
  initialLng?: number;
  onConfirm: (lat: number, lng: number, address: string) => void;
  onCancel: () => void;
}

export function LocationPicker({ initialLat, initialLng, onConfirm, onCancel }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const centerRef = useRef({ lat: initialLat || 50.0647, lng: initialLng || 19.9450 });
  const [address, setAddress] = useState('');
  const [resolving, setResolving] = useState(false);

  const resolve = useCallback(async (lat: number, lng: number) => {
    setResolving(true);
    const r = await reverseGeocode(lat, lng);
    setAddress(r?.displayName || '');
    setResolving(false);
  }, []);

  useEffect(() => {
    const c = centerRef.current;
    const map = L.map('location-picker-map', {
      zoomControl: false,
      attributionControl: false,
    }).setView([c.lat, c.lng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OSM',
    }).addTo(map);

    // Update center coordinate on every move
    map.on('moveend', () => {
      const pos = map.getCenter();
      centerRef.current = { lat: pos.lat, lng: pos.lng };
      resolve(pos.lat, pos.lng);
    });

    mapRef.current = map;
    resolve(c.lat, c.lng);

    return () => map.remove();
  }, [resolve]);

  const c = centerRef.current;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', background: '#FFF8F0', borderBottom: '2px solid rgba(255,107,107,0.15)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <button onClick={onCancel} style={{ border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer', padding: '4px', color: '#2C3E50' }}>✕</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>Wybierz lokalizację</div>
          <div style={{ fontSize: '12px', color: resolving ? '#999' : '#7F8C8D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {resolving ? 'Sprawdzanie adresu…' : (address || 'Przewiń mapę, by ustawić punkt')}
          </div>
        </div>
      </div>

      {/* Map with crosshair */}
      <div id="location-picker-map" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Fixed crosshair */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000, pointerEvents: 'none' }}>
          <div style={{ width: '32px', height: '32px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '2px', background: '#FF6B6B', transform: 'translateY(-50%)' }} />
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', background: '#FF6B6B', transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: '10px', height: '10px', border: '3px solid #FF6B6B', borderRadius: '50%', transform: 'translate(-50%, -50%)' }} />
          </div>
        </div>
      </div>

      {/* Coordinates */}
      <div style={{ padding: '8px 16px', background: '#FFF0E0', textAlign: 'center', fontSize: '13px', color: '#555', fontFamily: 'monospace', flexShrink: 0 }}>
        {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
      </div>

      {/* Confirm — with safe area padding for bottom nav */}
      <div style={{ padding: '12px 16px', paddingBottom: `calc(12px + env(safe-area-inset-bottom, 0px))`, flexShrink: 0 }}>
        <button class="btn btn-primary" onClick={() => onConfirm(c.lat, c.lng, address)}>✅ Potwierdź lokalizację</button>
      </div>
    </div>
  );
}
