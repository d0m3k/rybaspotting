import { useState, useRef } from 'preact/hooks';
import { api } from '../api';
import { LocationPicker } from '../components/LocationPicker';

// Lazy import exifr
let exifr: any = null;

export function UploadPage() {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [lat, setLat] = useState<number>(0);
  const [lng, setLng] = useState<number>(0);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [useManual, setUseManual] = useState(false);
  const [addressHint, setAddressHint] = useState('');
  const [nearbyFish, setNearbyFish] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'ok' | 'failed'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);
    setPhotoUrl(URL.createObjectURL(file));

    // Try to extract EXIF GPS (best-effort — often stripped on Android)
    let exifLat = 0, exifLng = 0;
    try {
      if (!exifr) {
        exifr = await import('exifr');
      }
      const gps = await exifr.gps(file);
      if (gps && gps.latitude && gps.longitude) {
        exifLat = gps.latitude;
        exifLng = gps.longitude;
      }
    } catch {
      // EXIF extraction failed — that's normal on modern Android
    }

    if (exifLat && exifLng) {
      setLat(exifLat);
      setLng(exifLng);
      setManualLat(String(exifLat));
      setManualLng(String(exifLng));
      setUseManual(false);
      setGpsStatus('ok');
      await checkNearby(exifLat, exifLng);
    } else {
      // No EXIF GPS — try browser geolocation as fallback
      setUseManual(true);
      setGpsStatus('failed');
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 5000,
          });
        });
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setManualLat(String(pos.coords.latitude));
        setManualLng(String(pos.coords.longitude));
        setUseManual(false);
        setGpsStatus('ok');
        await checkNearby(pos.coords.latitude, pos.coords.longitude);
      } catch {
        // No location at all — user can pick on map or type manually
      }
    }
  }

  async function checkNearby(checkLat: number, checkLng: number) {
    if (!checkLat || !checkLng) return;
    try {
      const nearby = await api.nearbyFish(checkLat, checkLng);
      setNearbyFish(nearby);
    } catch {
      setNearbyFish([]);
    }
  }

  function handleMapPick(lat: number, lng: number, address: string) {
    setLat(lat);
    setLng(lng);
    setManualLat(String(lat));
    setManualLng(String(lng));
    setUseManual(false);
    setGpsStatus('ok');
    if (address) setAddressHint(address);
    checkNearby(lat, lng);
    setShowMapPicker(false);
  }

  async function handleCollectExisting(fishId: number) {
    try {
      await api.collect(fishId);
      setMessage('Zebrane! 🎉');
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleSubmit() {
    if (!photoFile) return;

    const finalLat = useManual ? parseFloat(manualLat) : lat;
    const finalLng = useManual ? parseFloat(manualLng) : lng;

    if (!finalLat || !finalLng) {
      alert('Podaj lokalizację — użyj mapy, GPS lub wpisz ręcznie');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('photo', photoFile);
      formData.append('latitude', String(finalLat));
      formData.append('longitude', String(finalLng));
      formData.append('address_hint', addressHint);

      await api.createFish(formData, false);
      setMessage('Nowa ryba dodana! 🐟✨');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Retry browser geolocation
  async function retryGPS() {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
      setManualLat(String(pos.coords.latitude));
      setManualLng(String(pos.coords.longitude));
      setUseManual(false);
      setGpsStatus('ok');
      await checkNearby(pos.coords.latitude, pos.coords.longitude);
    } catch {
      alert('Nie udało się pobrać lokalizacji. Użyj mapy lub wpisz ręcznie.');
    }
  }

  if (message) {
    return (
      <div class="page">
        <div class="success-card">
          <h2>{message}</h2>
        </div>
      </div>
    );
  }

  return (
    <div class="page">
      <h2>Dodaj zdjęcie z galerii 📂</h2>

      {showMapPicker && (
        <LocationPicker
          initialLat={lat || 50.0647}
          initialLng={lng || 19.9450}
          onConfirm={handleMapPick}
          onCancel={() => setShowMapPicker(false)}
        />
      )}

      {!photoFile && (
        <div class="upload-start">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            class="file-input"
          />
        </div>
      )}

      {photoFile && (
        <div class="upload-confirm">
          <img src={photoUrl} alt="selected" class="photo-preview" />

          {/* ── Location section ── */}
          <div class="coords-section">
            {gpsStatus === 'ok' && !useManual && (
              <p class="coords-display">
                📍 {lat.toFixed(5)}, {lng.toFixed(5)}
                {lat !== 0 && (
                  <span style={{ fontSize: '11px', color: '#999' }}>
                    {' '}(z{lat !== parseFloat(manualLat || '0') ? ' mapy' : ' GPS/EXIF'})
                  </span>
                )}
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

            {gpsStatus === 'failed' && (
              <div style={{ marginBottom: '12px' }}>
                <p style={{ fontSize: '13px', color: '#7F8C8D', marginBottom: '8px', textAlign: 'center' }}>
                  📍 Nie znaleziono lokalizacji w zdjęciu ani z GPS.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button
                class="btn btn-secondary"
                style={{ flex: 1, fontSize: '14px', padding: '10px' }}
                onClick={() => setShowMapPicker(true)}
              >
                🗺️ Wybierz na mapie
              </button>
              {gpsStatus !== 'ok' && (
                <button
                  style={{ flex: 1, fontSize: '14px', padding: '10px', background: '#fff', color: '#4ECDC4', border: '2px solid #4ECDC4', borderRadius: '12px', cursor: 'pointer', fontWeight: 600 }}
                  onClick={retryGPS}
                >
                  📡 GPS
                </button>
              )}
            </div>

            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={useManual}
                onChange={() => setUseManual(!useManual)}
              />
              Wpisz współrzędne ręcznie
            </label>

            {useManual && (
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
            )}
          </div>

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
                    <p>{f.distance_meters.toFixed(0)}m od podanej lokalizacji</p>
                  </div>
                </div>
              ))}
              <p class="or-divider">— lub —</p>
            </div>
          )}

          {/* ── Submit ── */}
          <button
            class="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Wysyłanie...' : 'Dodaj nową rybę! 🐟'}
          </button>
        </div>
      )}
    </div>
  );
}
