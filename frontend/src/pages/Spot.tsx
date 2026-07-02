import { useState, useRef } from 'preact/hooks';
import { api } from '../api';

export function SpotPage() {
  const [step, setStep] = useState<'start' | 'photo' | 'confirm' | 'done'>('start');
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [lat, setLat] = useState<number>(0);
  const [lng, setLng] = useState<number>(0);
  const [nearbyFish, setNearbyFish] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [addressHint, setAddressHint] = useState('');
  const [message, setMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function startCapture() {
    setLoading(true);
    // Get geolocation
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
    } catch {
      alert('Nie można pobrać lokalizacji. Włącz GPS.');
      setLoading(false);
      return;
    }

    // Try camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setStep('photo');
      }
    } catch {
      // Fallback to file input
      fileInputRef.current?.click();
    }
    setLoading(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setPhotoBlob(blob);
      setPhotoUrl(canvas.toDataURL('image/jpeg'));

      // Stop camera
      const stream = video.srcObject as MediaStream;
      stream?.getTracks().forEach(t => t.stop());

      // Check nearby fish
      await checkNearby();
      setStep('confirm');
    }, 'image/jpeg', 0.9);
  }

  async function handleFileInput(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoBlob(file);
    setPhotoUrl(URL.createObjectURL(file));

    // Check nearby
    await checkNearby();
    setStep('confirm');
  }

  async function checkNearby() {
    try {
      const nearby = await api.nearbyFish(lat, lng);
      setNearbyFish(nearby);
    } catch {
      setNearbyFish([]);
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

  async function handleSubmitNew() {
    setLoading(true);
    try {
      const formData = new FormData();
      if (photoBlob) {
        formData.append('photo', photoBlob, 'capture.jpg');
      }
      formData.append('latitude', String(lat));
      formData.append('longitude', String(lng));
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
    setPhotoBlob(null);
    setPhotoUrl('');
    setNearbyFish([]);
    setAddressHint('');
    setMessage('');
  }

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
          <p>Twoja lokalizacja zostanie automatycznie użyta.</p>
          <button class="btn btn-primary" onClick={startCapture} disabled={loading}>
            {loading ? 'Pobieranie lokalizacji...' : 'Zrób zdjęcie!'}
          </button>
          {/* Hidden file input as fallback */}
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

      {step === 'photo' && (
        <div class="camera-view">
          <video ref={videoRef} autoplay playsinline class="camera-video" />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <button class="btn btn-primary capture-btn" onClick={capturePhoto}>
            Zrób zdjęcie!
          </button>
        </div>
      )}

      {step === 'confirm' && (
        <div class="confirm-view">
          <img src={photoUrl} alt="captured" class="photo-preview" />

          <p class="coords-display">
            📍 {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>

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
                    <p>{f.distance_meters.toFixed(0)}m od Ciebie</p>
                  </div>
                </div>
              ))}
              <p class="or-divider">— lub —</p>
            </div>
          )}

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
