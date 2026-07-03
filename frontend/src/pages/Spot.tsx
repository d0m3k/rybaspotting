import { useState, useRef, useEffect } from 'preact/hooks';
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

  // ── Camera capture state ──────────────────────────────────────────
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  // ── Camera management ─────────────────────────────────────────────
  async function startCamera(mode: 'environment' | 'user') {
    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      streamRef.current = mediaStream;
      setHasCamera(true);
    } catch (err) {
      console.error('Failed to get camera with mode', mode, err);
      // Fallback: try default camera without facingMode constraint
      if (mode === 'environment') {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          setStream(fallbackStream);
          streamRef.current = fallbackStream;
          setHasCamera(true);
          return;
        } catch (e) {
          console.error('All camera attempts failed', e);
        }
      }
      setHasCamera(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
  }

  function toggleCamera() {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    startCamera(newMode);
  }

  // Initialize camera and location on mount
  useEffect(() => {
    // Start getting location immediately
    setGpsStatus('loading');
    getLocation().then((loc) => {
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
    });

    // Start camera stream
    startCamera(facingMode);

    return () => {
      // Clean up camera stream on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Update srcObject on video ref when stream changes or step returns to start
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, step]);

  // ── Capture from inline camera ────────────────────────────────────
  function capturePhoto() {
    if (!videoRef.current) return;
    setLoading(true);

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setLoading(false);
      return;
    }

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // Scale down image to max 1200px width/height (matches backend MaxPhotoWidth)
    const maxDim = 1200;
    let targetWidth = videoWidth;
    let targetHeight = videoHeight;
    if (videoWidth > maxDim || videoHeight > maxDim) {
      if (videoWidth > videoHeight) {
        targetWidth = maxDim;
        targetHeight = Math.round((videoHeight / videoWidth) * maxDim);
      } else {
        targetHeight = maxDim;
        targetWidth = Math.round((videoWidth / videoHeight) * maxDim);
      }
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setPhotoBlob(blob);
          if (photoUrl) URL.revokeObjectURL(photoUrl);
          setPhotoUrl(URL.createObjectURL(blob));

          // Stop camera stream to release hardware
          stopCamera();

          // Check nearby fish
          const checkLat = useManualCoords ? parseFloat(manualLat) : lat;
          const checkLng = useManualCoords ? parseFloat(manualLng) : lng;
          if (checkLat && checkLng) {
            api.nearbyFish(checkLat, checkLng)
              .then(setNearbyFish)
              .catch(() => setNearbyFish([]));
          }

          setStep('confirm');
        }
        setLoading(false);
      },
      'image/jpeg',
      0.85
    );
  }

  // ── File selected (gallery fallback) ──────────────────────────────
  async function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setLoading(true);
    stopCamera();

    try {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const maxDim = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h / w) * maxDim);
            w = maxDim;
          } else {
            w = Math.round((w / h) * maxDim);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(img.src);
            if (blob) {
              setPhotoBlob(blob);
              if (photoUrl) URL.revokeObjectURL(photoUrl);
              setPhotoUrl(URL.createObjectURL(blob));

              // Check nearby fish
              const checkLat = useManualCoords ? parseFloat(manualLat) : lat;
              const checkLng = useManualCoords ? parseFloat(manualLng) : lng;
              if (checkLat && checkLng) {
                api.nearbyFish(checkLat, checkLng)
                  .then(setNearbyFish)
                  .catch(() => setNearbyFish([]));
              }

              setStep('confirm');
            } else {
              setPhotoBlob(file);
              if (photoUrl) URL.revokeObjectURL(photoUrl);
              setPhotoUrl(URL.createObjectURL(file));
              setStep('confirm');
            }
            setLoading(false);
          },
          'image/jpeg',
          0.85
        );
      } else {
        throw new Error('Could not get canvas context');
      }
    } catch (err) {
      console.error('Failed to resize selected image', err);
      setPhotoBlob(file);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl(URL.createObjectURL(file));
      setStep('confirm');
      setLoading(false);
    }
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
    if (photoUrl) URL.revokeObjectURL(photoUrl);
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

    // Restart geolocation
    setGpsStatus('loading');
    getLocation().then((loc) => {
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
    });

    // Restart camera
    startCamera(facingMode);
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
          {hasCamera === null && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p>Uruchamianie aparatu i pobieranie lokalizacji... ⏳</p>
            </div>
          )}

          {hasCamera === true && (
            <div class="camera-view">
              <div style={{ position: 'relative', width: '100%' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  class="camera-video"
                  style={{ width: '100%', maxHeight: '45vh', objectFit: 'cover', borderRadius: '14px', background: '#000', display: 'block' }}
                />
                <button
                  type="button"
                  onClick={toggleCamera}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    background: 'rgba(0, 0, 0, 0.6)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    fontSize: '18px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(4px)',
                    zIndex: 10
                  }}
                  title="Przełącz aparat"
                >
                  🔄
                </button>
              </div>

              <div style={{ textAlign: 'center', margin: '4px 0', fontSize: '13px', color: '#7F8C8D' }}>
                {gpsStatus === 'loading' && <span>📡 Pobieranie GPS...</span>}
                {gpsStatus === 'ok' && <span style={{ color: '#2ECC71' }}>📍 Lokalizacja GPS pobrana</span>}
                {gpsStatus === 'failed' && <span style={{ color: '#E74C3C' }}>⚠️ Brak GPS (będziesz mógł wpisać ręcznie)</span>}
              </div>

              <button
                class="btn btn-primary capture-btn"
                onClick={capturePhoto}
                disabled={loading}
              >
                {loading ? 'Przetwarzanie...' : 'Zrób zdjęcie 📸'}
              </button>

              <button
                class="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                Wybierz z galerii 📂
              </button>
            </div>
          )}

          {hasCamera === false && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
              <p>Aparat jest niedostępny lub brak uprawnień.</p>
              
              <div style={{ textAlign: 'center', fontSize: '13px', color: '#7F8C8D' }}>
                {gpsStatus === 'loading' && <span>📡 Pobieranie GPS...</span>}
                {gpsStatus === 'ok' && <span style={{ color: '#2ECC71' }}>📍 Lokalizacja GPS pobrana</span>}
                {gpsStatus === 'failed' && <span style={{ color: '#E74C3C' }}>⚠️ Brak GPS (będziesz mógł wpisać ręcznie)</span>}
              </div>

              <button
                class="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                Wybierz zdjęcie z galerii 📂
              </button>
            </div>
          )}

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

          <button
            class="btn btn-secondary"
            style={{ marginTop: '8px', background: '#95A5A6', boxShadow: 'none' }}
            onClick={() => {
              setStep('start');
              setPhotoBlob(null);
              if (photoUrl) URL.revokeObjectURL(photoUrl);
              setPhotoUrl('');
              setNearbyFish([]);
              startCamera(facingMode);
            }}
            disabled={loading}
          >
            Anuluj / Zrób inne zdjęcie ↩️
          </button>
        </div>
      )}
    </div>
  );
}
