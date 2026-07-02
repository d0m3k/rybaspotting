import { useState, useEffect } from 'preact/hooks';
import { api } from '../api';
import { AuthState } from '../stores/auth';

interface Props {
  auth: AuthState;
  onLogout: () => void;
}

export function ProfilePage({ auth, onLogout }: Props) {
  const [myFish, setMyFish] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load all fish to find user's spots
    api.listFish(1, 200)
      .then(fish => {
        setMyFish(fish.filter((f: any) => f.spotted_by === auth.userId));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [auth.userId]);

  return (
    <div class="page">
      <h2>👤 Profil</h2>
      <p><strong>{auth.displayName || auth.username}</strong></p>
      <p>Status: {auth.isActive ? '✅ Aktywny' : '⏳ Oczekuje na zatwierdzenie'}</p>
      {auth.isAdmin && <p>🔑 Admin</p>}

      <h3>Moje spotted ryby ({myFish.length})</h3>
      {loading ? (
        <p>Ładowanie...</p>
      ) : (
        <div class="my-fish-list">
          {myFish.map(f => (
            <div key={f.id} class="my-fish-item">
              <img src={`/photos/${f.photo_filename}`} alt="ryba" class="mini-thumb" />
              <div>
                <p>📍 {f.latitude.toFixed(4)}, {f.longitude.toFixed(4)}</p>
                <p class="date">{new Date(f.created_at).toLocaleDateString('pl-PL')}</p>
              </div>
            </div>
          ))}
          {myFish.length === 0 && <p>Nie spottedowałeś jeszcze żadnej ryby.</p>}
        </div>
      )}

      <button class="btn btn-logout" onClick={onLogout}>
        Wyloguj
      </button>
    </div>
  );
}
