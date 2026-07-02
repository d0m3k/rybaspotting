import { useState, useRef } from 'preact/hooks';
import { api } from '../api';

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

  async function handleFileSelect(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);
    setPhotoUrl(URL.createObjectURL(file));

    // Try to extract EXIF GPS
    try {
      if (!exifr) {
        exifr = await import('exifr');
      }
      const gps = await exifr.gps(file);
      if (gps) {
        setLat(gps.latitude);
        setLng(gps.longitude);
        setManualLat(String(gps.latitude));
        setManualLng(String(gps.longitude));
      } else {
        setUseManual(true);
      }
    } catch {
      setUseManual(true);
    }

    // Check nearby
    if (lat !== 0 || manualLat) {
      const checkLat = lat || parseFloat(manualLat);
      const checkLng = lng || parseFloat(manualLng);
      if (checkLat && checkLng) {
        try {
          const nearby = await api.nearbyFish(checkLat, checkLng);
          setNearbyFish(nearby);
        } catch {}
      }
    }
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
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('photo', photoFile);
      formData.append('latitude', String(useManual ? parseFloat(manualLat) : lat));
      formData.append('longitude', String(useManual ? parseFloat(manualLng) : lng));
      formData.append('address_hint', addressHint);

      await api.createFish(formData, false);
      setMessage('Nowa ryba dodana! 🐟✨');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
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

          <div class="coords-section">
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={useManual}
                onChange={() => setUseManual(!useManual)}
              />
              Wpisz lokalizację ręcznie
            </label>

            {useManual ? (
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
            ) : (
              <p class="coords-display">
                📍 {lat.toFixed(5)}, {lng.toFixed(5)} (z EXIF)
              </p>
            )}
          </div>

          <input
            class="input"
            type="text"
            placeholder="Opis miejsca (opcjonalnie)"
            value={addressHint}
            onInput={(e: any) => setAddressHint(e.target.value)}
          />

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
