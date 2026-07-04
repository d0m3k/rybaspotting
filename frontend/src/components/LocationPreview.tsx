import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import { reverseGeocode, ReverseGeoResult } from '../geocode';

interface Props {
  lat: number;
  lng: number;
  onChange: () => void;
  onAddress?: (result: ReverseGeoResult | null) => void;
}

export function LocationPreview({ lat, lng, onChange, onAddress }: Props) {
  const [address, setAddress] = useState<string>('');
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    // Resolve address
    setResolving(true);
    reverseGeocode(lat, lng).then((r) => {
      const addr = r?.displayName || '';
      setAddress(addr);
      setResolving(false);
      if (onAddress) onAddress(r);
    }).catch(() => {
      setAddress('');
      setResolving(false);
    });
  }, [lat, lng]);

  useEffect(() => {
    const container = document.getElementById('location-preview-map');
    if (!container) return;

    const map = L.map(container, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      keyboard: false,
    }).setView([lat, lng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OSM',
    }).addTo(map);

    // Add crosshair marker
    L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'location-preview-marker',
        html: `<div style="
          width:16px;height:16px;
          border:3px solid #FF6B6B;
          border-radius:50%;
          background:rgba(255,107,107,0.3);
          box-shadow:0 0 8px rgba(255,107,107,0.5);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
      interactive: false,
    }).addTo(map);

    // Invalidate size after a short delay (for CSS transitions / flex layouts)
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
    };
  }, [lat, lng]);

  return (
    <div class="location-preview" onClick={onChange}>
      <div id="location-preview-map" class="location-preview-map"></div>
      <div class="location-preview-address">
        {resolving ? (
          <span class="location-preview-resolving">Sprawdzanie adresu…</span>
        ) : address ? (
          <span>📍 {address}</span>
        ) : (
          <span class="location-preview-coords">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
        )}
        <span class="location-preview-change">(dotknij, by zmienić)</span>
      </div>
    </div>
  );
}
