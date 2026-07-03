import { useState, useEffect } from 'preact/hooks';
import { api } from '../api';
import { AuthState } from '../stores/auth';

interface UserStats {
  user_id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  spotted: number;
  collected: number;
}

interface Props {
  auth: AuthState;
  onLogout: () => void;
}

function getInitial(name: string): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

export function ProfilePage({ auth, onLogout }: Props) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [myFish, setMyFish] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getMyStats().catch(() => null),
      api.listFish(1, 200).catch(() => []),
    ]).then(([s, fish]) => {
      setStats(s);
      setMyFish((fish as any[]).filter((f: any) => f.spotted_by === auth.userId));
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [auth.userId]);

  const displayName = stats?.display_name || auth.displayName || auth.username;
  const initial = getInitial(displayName);

  if (loading) {
    return <div class="page"><p class="loading-text">Ładowanie profilu…</p></div>;
  }

  return (
    <div class="page">
      <div class="profile-header">
        <div class="profile-avatar">{initial}</div>
        <div class="profile-name">{displayName}</div>
        <div class="profile-username">@{auth.username}</div>

        <div class="profile-badges">
          {auth.isAdmin && <span class="profile-badge badge-admin">🔑 Admin</span>}
        </div>

        {stats && (
          <div class="profile-stats">
            <div class="profile-stat">
              <div class="stats-fish-icon">📸</div>
              <div class="stat-count spotted">{stats.spotted}</div>
              <div class="stat-label">Spotted</div>
            </div>
            <div class="profile-stat">
              <div class="stats-fish-icon">🎣</div>
              <div class="stat-count collected">{stats.collected}</div>
              <div class="stat-label">Zebrane</div>
            </div>
          </div>
        )}
      </div>

      <h3>Moje spotted ryby ({myFish.length})</h3>
      {myFish.length === 0 ? (
        <p style="text-align:center; color:#999; padding: 20px 0;">
          Nie spottedowałeś jeszcze żadnej ryby. 🐟<br />
          <span style="font-size:13px;">Przejdź do zakładki <strong>Spot</strong> aby dodać pierwszą!</span>
        </p>
      ) : (
        <div class="my-fish-list">
          {myFish.map(f => (
            <div key={f.id} class="my-fish-item">
              <img src={`/api/photos/${f.photo_filename}`} alt="ryba" class="mini-thumb" />
              <div>
                <p style="font-weight:500;font-size:14px;">📍 {f.latitude.toFixed(4)}, {f.longitude.toFixed(4)}</p>
                <p class="date">{new Date(f.created_at).toLocaleDateString('pl-PL')}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <button class="btn btn-logout" onClick={onLogout}>
        Wyloguj
      </button>
    </div>
  );
}
