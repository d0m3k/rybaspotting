import { useState, useRef } from 'preact/hooks';
import { api } from '../api';
import { LocationPicker } from '../components/LocationPicker';

type Step = 'start' | 'confirm' | 'done';

export function SpotPage() {
  const [step, setStep] = useState<Step>('start');
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
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

  // ── Geolocation ───────────────────────────────────────────────────
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

  // ── Start: get location, then open gallery ───────────────────────
  async function startCapture() {
    setLoading(true);
    setGpsStatus('loading');

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
    // Open file picker — on mobile this is the gallery (in-app overlay, no backgrounding).
    // User should take the photo with their camera app before coming here.
    fileInputRef.current?.click();
  }

  // ── File selected ────────────────────────────────────────────────
  async function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setPhotoBlob(file);
    setPhotoUrl(URL.createObjectURL(file));

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

  // ── Submit ───────────────────────────────────────────────────────
  async function handleSubmitNew() {
    const finalLat = useManualCoords ? parseFloat(manualLat) : lat;
    const finalLng = useManualCoords ? parseFloat(manualLng) : lng;

    if (!finalLat || !finalLng) {
      alert('Podaj lokalizację (GPS lub ręcznie)');
      return;
    }
    if (!photoBlob) {
      alert('Najpierw wybierz zdjęcie');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('photo', photoBlob, 'capture.jpg');
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

  async function handleCollectExisting(fishId: number) {
    try {
      await api.collect(fishId);
      setMessage('Zebrane! 🎉');
      setStep('done');
    } catch (err: any) {
      alert(err.message);
    }
  }

  function reset() {
    setStep('start');
    setPhotoBlob(null);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Render ───────────────────────────────────────────────────────
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
          <p>Zrób zdjęcie rybie aparatem, potem wybierz je z galerii.</p>
          <p style="font-size:13px;color:#7F8C8D;text-align:center;">
            📸 Zrób zdjęcie w aplikcji aparatu → wróć tu → kliknij przycisk.
          </p>

          {gpsStatus === 'failed' && (
            <p style={{ color: '#7F8C8D', fontSize: '13px', textAlign: 'center' }}>
              ℹ️ Lokalizacja niedostępna — będziesz mógł wpisać współrzędne ręcznie.
            </p>
          )}

          <button class="btn btn-primary" onClick={startCapture} disabled={loading}>
            {loading ? 'Pobieranie lokalizacji…' : 'Wybierz zdjęcie z galerii 📂'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
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
                setUseManualCoords(false);
                setGpsStatus('ok');
                if (address) setAddressHint(address);
                setShowMapPicker(false);
              }}
              onCancel={() => setShowMapPicker(false)}
            />
          )}

          <img src={photoUrl} alt="captured" class="photo-preview" />

          {/* ── Coordinates ── */}
          {!useManualCoords && gpsStatus === 'ok' && (
            <p class="coords-display">
              📍 {lat.toFixed(5)}, {lng.toFixed(5)}{' '}
              <a href="#" style={{ fontSize: '12px', color: '#4ECDC4' }}
                onClick={(e) => { e.preventDefault(); setShowMapPicker(true); }}>
                (zmień na mapie)
              </a>
            </p>
          )}

          {(useManualCoords || gpsStatus === 'failed') && (
            <div>
              <p style={{ fontSize: '13px', color: '#7F8C8D', marginBottom: '8px', textAlign: 'center' }}>
                📍 {gpsStatus === 'failed' ? 'Lokalizacja nie pobrana — wpisz ręcznie:' : 'Edytuj współrzędne:'}
              </p>
              <div class="coords-inputs">
                <input class="input" type="number" step="0.000001" placeholder="Szerokość (lat)"
                  value={manualLat} onInput={(e: any) => setManualLat(e.target.value)} />
                <input class="input" type="number" step="0.000001" placeholder="Długość (lng)"
                  value={manualLng} onInput={(e: any) => setManualLng(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button class="btn btn-secondary" style={{ flex: 1, fontSize: '14px', padding: '10px' }}
                  onClick={() => setShowMapPicker(true)}>
                  🗺️ Wybierz na mapie
                </button>
                <button style={{ flex: 1, fontSize: '14px', padding: '10px', background: '#fff', color: '#4ECDC4', border: '2px solid #4ECDC4', borderRadius: '12px', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setGpsStatus('ok'); setUseManualCoords(false); },
                      () => alert('Nie można pobrać lokalizacji'),
                      { enableHighAccuracy: true, timeout: 10000 },
                    );
                  }}>
                  📡 GPS
                </button>
              </div>
            </div>
          )}

          <input class="input" type="text" placeholder="Opis miejsca (opcjonalnie)"
            value={addressHint} onInput={(e: any) => setAddressHint(e.target.value)} />

          {nearbyFish.length > 0 && (
            <div class="nearby-section">
              <h3>Czy to jedna z tych ryb?</h3>
              {nearbyFish.map((f) => (
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

          <button class="btn btn-primary" onClick={handleSubmitNew} disabled={loading}>
            {loading ? 'Wysyłanie...' : 'Nowa ryba! 🐟'}
          </button>
        </div>
      )}
    </div>
  );
}
