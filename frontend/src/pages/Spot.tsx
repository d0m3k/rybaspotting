import { useState, useRef } from 'preact/hooks';
import { api } from '../api';
import { LocationPicker } from '../components/LocationPicker';

// Downscale an image to a maximum width (preserves aspect ratio).
// Returns a Blob suitable for upload — reduces memory on mobile.
function downscaleImage(file: File, maxWidth: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      let w = img.naturalWidth;
      let h = img.naturalHeight;

      // Only downscale if wider than maxWidth
      if (w > maxWidth) {
        const ratio = maxWidth / w;
        w = maxWidth;
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('canvas.toBlob failed'));
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Fallback: return the original file if we can't decode it
      resolve(file);
    };
    img.src = url;
  });
}

type Step = 'start' | 'confirm' | 'done';

export function SpotPage() {
  const [step, setStep] = useState<Step>('start');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [lat, setLat] = useState<number>(0);
  const [lng, setLng] = useState<number>(0);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [useManualCoords, setUseManualCoords] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'ok' | 'failed'>('idle');
  const [nearbyFish, setNearbyFish] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [addressHint, setAddressHint] = useState('');
  const [message, setMessage] = useState('');
  const [showMapPicker, setShowMapPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Geolocation + trigger native camera ─────────────────────────────
  async function startCapture() {
    setLoading(true);
    setGpsStatus('loading');

    // 1. Try geolocation (non-blocking — we continue either way)
    const loc = await getLocation();
    if (loc) {
      setLat(loc.lat);
      setLng(loc.lng);
      setManualLat(String(loc.lat));
      setManualLng(String(loc.lng));
      setGpsStatus('ok');
    } else {
      setGpsStatus('failed');
      setUseManualCoords(true);
    }

    setLoading(false);

    // 2. Open native camera / file picker
    //    capture="environment" → native camera on mobile, file picker on desktop
    fileInputRef.current?.click();
  }

  async function getLocation(): Promise<{ lat: number; lng: number } | null> {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 60000,
        });
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  }

  // ── File picked (from camera or gallery) ────────────────────────────
  async function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return; // user cancelled — stay on start

    // Downscale the image client-side to avoid memory issues on mobile
    // Max 1200px wide (matches backend MaxPhotoWidth for consistency)
    const downscaled = await downscaleImage(file, 1200);
    setPhotoFile(downscaled);
    setPhotoUrl(URL.createObjectURL(downscaled));

    // Check nearby fish
    const checkLat = useManualCoords ? parseFloat(manualLat) : lat;
    const checkLng = useManualCoords ? parseFloat(manualLng) : lng;
    if (checkLat && checkLng) {
      try {
        const nearby = await api.nearbyFish(checkLat, checkLng);
        setNearbyFish(nearby);
      } catch {
        setNearbyFish([]);
      }
    }

    setStep('confirm');
  }

  // ── Submit / Collect ────────────────────────────────────────────────
  async function handleCollectExisting(fishId: number) {
    try {
      await api.collect(fishId);
      setMessage('Zebrane! 🎉');
      setStep('done');
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleSubmitNew() {
    const finalLat = useManualCoords ? parseFloat(manualLat) : lat;
    const finalLng = useManualCoords ? parseFloat(manualLng) : lng;

    if (!finalLat || !finalLng) {
      alert('Podaj lokalizację (GPS lub ręcznie)');
      return;
    }
    if (!photoFile) {
      alert('Najpierw zrób zdjęcie');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('photo', photoFile, 'capture.jpg');
      formData.append('latitude', String(finalLat));
      formData.append('longitude', String(finalLng));
      formData.append('address_hint', addressHint);

      await api.createFish(formData, true);
      setMessage('Nowa ryba spotted! 🐟✨');
      setStep('done');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep('start');
    setPhotoFile(null);
    setPhotoUrl('');
    setLat(0);
    setLng(0);
    setManualLat('');
    setManualLng('');
    setUseManualCoords(false);
    setGpsStatus('idle');
    setNearbyFish([]);
    setAddressHint('');
    setMessage('');
    // Reset file input so picking the same file re-fires onChange
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Render ──────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div class="page">
        <div class="success-card">
          <h2>{message}</h2>
          <button class="btn btn-primary" onClick={reset}>Spotted another!</button>
        </div>
      </div>
    );
  }

  return (
    <div class="page">
      <h2>Spot on the spot 📸</h2>

      {step === 'start' && (
        <div class="spot-start">
          <p>Zrób zdjęcie rybie w miejscu, gdzie ją znalazłeś.</p>
          <p style="font-size:13px;color:#7F8C8D;text-align:center;">
            Otworzy się aparat — zrobisz zdjęcie i wrócisz do apki.
          </p>

          {gpsStatus === 'failed' && (
            <p style={{ color: '#7F8C8D', fontSize: '13px', textAlign: 'center' }}>
              ℹ️ Lokalizacja niedostępna — będziesz mógł wpisać współrzędne ręcznie.
            </p>
          )}

          <button class="btn btn-primary" onClick={startCapture} disabled={loading}>
            {loading ? 'Pobieranie lokalizacji…' : 'Zrób zdjęcie! 📷'}
          </button>

          {/* Native camera on mobile, file picker on desktop */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
        </div>
      )}

      {step === 'confirm' && (
        <div class="confirm-view">
          {showMapPicker && (
            <LocationPicker
              initialLat={lat || 50.0647}
              initialLng={lng || 19.9450}
              onConfirm={(newLat, newLng, address) => {
                setLat(newLat);
                setLng(newLng);
                setManualLat(String(newLat));
                setManualLng(String(newLng));
                setUseManualCoords(false);
                setGpsStatus('ok');
                if (address) setAddressHint(address);
                setShowMapPicker(false);
              }}
              onCancel={() => setShowMapPicker(false)}
            />
          )}

          <img src={photoUrl} alt="captured" class="photo-preview" />

          {/* ── Coordinates section ── */}
          {!useManualCoords && gpsStatus === 'ok' && (
            <p class="coords-display">
              📍 {lat.toFixed(5)}, {lng.toFixed(5)}
              {' '}
              <a
                href="#"
                style={{ fontSize: '12px', color: '#4ECDC4' }}
                onClick={(e) => { e.preventDefault(); setShowMapPicker(true); }}
              >
                (zmień na mapie)
              </a>
            </p>
          )}

          {(useManualCoords || gpsStatus === 'failed') && (
            <div>
              <p style={{ fontSize: '13px', color: '#7F8C8D', marginBottom: '8px', textAlign: 'center' }}>
                {gpsStatus === 'failed'
                  ? '📍 Lokalizacja nie została pobrana automatycznie — wpisz współrzędne ręcznie:'
                  : '📍 Edytuj współrzędne:'}
              </p>
              <div class="coords-inputs">
                <input
                  class="input"
                  type="number"
                  step="0.000001"
                  placeholder="Szerokość (lat)"
                  value={manualLat}
                  onInput={(e: any) => setManualLat(e.target.value)}
                />
                <input
                  class="input"
                  type="number"
                  step="0.000001"
                  placeholder="Długość (lng)"
                  value={manualLng}
                  onInput={(e: any) => setManualLng(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  class="btn btn-secondary"
                  style={{ flex: 1, fontSize: '14px', padding: '10px' }}
                  onClick={() => setShowMapPicker(true)}
                >
                  🗺️ Wybierz na mapie
                </button>
                <button
                  style={{ flex: 1, fontSize: '14px', padding: '10px', background: '#fff', color: '#4ECDC4', border: '2px solid #4ECDC4', borderRadius: '12px', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setLat(pos.coords.latitude);
                        setLng(pos.coords.longitude);
                        setManualLat(String(pos.coords.latitude));
                        setManualLng(String(pos.coords.longitude));
                        setUseManualCoords(false);
                        setGpsStatus('ok');
                      },
                      () => alert('Nadal nie można pobrać lokalizacji'),
                      { enableHighAccuracy: true, timeout: 10000 }
                    );
                  }}
                >
                  📡 GPS
                </button>
              </div>
            </div>
          )}

          {/* ── Address hint ── */}
          <input
            class="input"
            type="text"
            placeholder="Opis miejsca (opcjonalnie)"
            value={addressHint}
            onInput={(e: any) => setAddressHint(e.target.value)}
          />

          {/* ── Nearby fish ── */}
          {nearbyFish.length > 0 && (
            <div class="nearby-section">
              <h3>Czy to jedna z tych ryb?</h3>
              {nearbyFish.map(f => (
                <div key={f.id} class="nearby-card" onClick={() => handleCollectExisting(f.id)}>
                  <img src={`/api/photos/${f.photo_filename}`} alt="ryba" class="nearby-thumb" />
                  <div>
                    <p>Spotter: {f.spotter_name}</p>
                    <p>{f.distance_meters.toFixed(0)}m od Ciebie</p>
                  </div>
                </div>
              ))}
              <p class="or-divider">— lub —</p>
            </div>
          )}

          {/* ── Submit ── */}
          <button
            class="btn btn-primary"
            onClick={handleSubmitNew}
            disabled={loading}
          >
            {loading ? 'Wysyłanie...' : 'Nowa ryba! 🐟'}
          </button>
        </div>
      )}
    </div>
  );
}
