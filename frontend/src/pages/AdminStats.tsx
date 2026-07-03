import { useState, useEffect } from 'preact/hooks';
import { api } from '../api';

interface FishEntry {
  id: number;
  photo_filename: string;
  latitude: number;
  longitude: number;
  address_hint: string;
  spotted_by: number;
  spotter_name: string;
  created_at: string;
}

export function AdminStatsPage() {
  const [stats, setStats] = useState<{
    user_count: number;
    fish_count: number;
    photo_count: number;
    photo_size_mb: number;
  } | null>(null);
  const [fishList, setFishList] = useState<FishEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Promote state
  const [promoteUser, setPromoteUser] = useState('');
  const [promoteMsg, setPromoteMsg] = useState('');
  const [promoteErr, setPromoteErr] = useState('');
  const [promoting, setPromoting] = useState(false);

  // Delete state
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [s, fish] = await Promise.all([
        api.getAdminStats(),
        api.listAllFish(),
      ]);
      setStats(s);
      setFishList(fish);
    } catch (err: any) {
      setError(err.message);
      setStats(null);
      setFishList([]);
    } finally {
      setLoading(false);
    }
  }

  async function handlePromote(e: Event) {
    e.preventDefault();
    const name = promoteUser.trim();
    if (!name) return;
    setPromoteErr('');
    setPromoteMsg('');
    setPromoting(true);
    try {
      const res: any = await api.promoteUser(name);
      setPromoteMsg(res.message || 'Promoted!');
      setPromoteUser('');
      loadData();
    } catch (err: any) {
      setPromoteErr(err.message);
    } finally {
      setPromoting(false);
    }
  }

  async function handleDelete(fishId: number) {
    if (!confirm(`Usunąć rybę #${fishId}? Zdjęcie i dane zostaną trwale usunięte.`)) return;
    setDeleting(fishId);
    try {
      await api.deleteFish(fishId);
      setFishList(prev => prev.filter(f => f.id !== fishId));
      if (stats) setStats({ ...stats, fish_count: stats.fish_count - 1 });
    } catch (err: any) {
      alert('Błąd: ' + err.message);
    } finally {
      setDeleting(null);
    }
  }

  if (loading) return <div class="page"><p class="loading-text">Ładowanie…</p></div>;

  if (error) {
    return (
      <div class="page">
        <h2>🔑 Admin Panel</h2>
        <p class="error-msg">{error}</p>
        <p style="text-align:center;color:#999;">Tylko administratorzy mają dostęp.</p>
      </div>
    );
  }

  return (
    <div class="page">
      <h2>🔑 Admin Panel</h2>

      {stats && (
        <div class="profile-stats" style="flex-wrap:wrap;">
          <div class="profile-stat">
            <div class="stats-fish-icon">👥</div>
            <div class="stat-count spotted">{stats.user_count}</div>
            <div class="stat-label">Użytkowników</div>
          </div>
          <div class="profile-stat">
            <div class="stats-fish-icon">🐟</div>
            <div class="stat-count collected">{stats.fish_count}</div>
            <div class="stat-label">Ryby spotted</div>
          </div>
          <div class="profile-stat">
            <div class="stats-fish-icon">🖼️</div>
            <div class="stat-count" style="color:#FFE66D;">{stats.photo_count}</div>
            <div class="stat-label">Zdjęć</div>
          </div>
          <div class="profile-stat">
            <div class="stats-fish-icon">💾</div>
            <div class="stat-count" style="color:#4ECDC4;">{stats.photo_size_mb}</div>
            <div class="stat-label">MB zdjęć</div>
          </div>
        </div>
      )}

      {/* Promote user */}
      <div style="margin-top:24px;padding:16px;background:#fff;border-radius:14px;border:1px solid #F0E0D0;">
        <h3 style="margin-bottom:8px;">👑 Promuj użytkownika na admina</h3>
        <form onSubmit={handlePromote} style="display:flex;gap:8px;">
          <input
            class="input"
            type="text"
            placeholder="Nazwa użytkownika"
            value={promoteUser}
            onInput={(e: any) => setPromoteUser(e.target.value)}
            style="margin-bottom:0;flex:1;"
            required
          />
          <button class="btn btn-primary" type="submit" disabled={promoting} style="width:auto;padding:12px 20px;">
            {promoting ? '…' : 'Promuj'}
          </button>
        </form>
        {promoteErr && <p class="error-msg" style="margin-top:8px;">{promoteErr}</p>}
        {promoteMsg && <p class="success-msg" style="margin-top:8px;">{promoteMsg}</p>}
      </div>

      {/* All fish */}
      <div style="margin-top:24px;">
        <h3>🐟 Wszystkie ryby ({fishList.length})</h3>

        {fishList.length === 0 ? (
          <p style="text-align:center;color:#999;padding:24px;">Brak ryb do wyświetlenia.</p>
        ) : (
          <div style="display:flex;flex-direction:column;gap:12px;">
            {fishList.map(fish => (
              <div
                key={fish.id}
                style="background:#fff;border-radius:14px;border:1px solid #F0E0D0;overflow:hidden;display:flex;flex-direction:column;"
              >
                {/* Photo */}
                <div style="width:100%;aspect-ratio:4/3;background:#f5e8d8;overflow:hidden;">
                  {fish.photo_filename ? (
                    <img
                      src={`/api/photos/${fish.photo_filename}`}
                      alt={`Ryba #${fish.id}`}
                      style="width:100%;height:100%;object-fit:cover;"
                      loading="lazy"
                    />
                  ) : (
                    <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ccc;">
                      Brak zdjęcia
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style="padding:12px;">
                  <div style="display:flex;justify-content:space-between;align-items:start;">
                    <div>
                      <strong>#{fish.id}</strong>
                      {' '}
                      <span style="color:#E67E22;">{fish.spotter_name}</span>
                    </div>
                    <button
                      class="btn"
                      style="background:#E74C3C;color:#fff;padding:6px 14px;font-size:12px;border:none;border-radius:8px;cursor:pointer;opacity:1;min-width:auto;"
                      onClick={() => handleDelete(fish.id)}
                      disabled={deleting === fish.id}
                    >
                      {deleting === fish.id ? '…' : '🗑 Usuń'}
                    </button>
                  </div>
                  <div style="font-size:12px;color:#999;margin-top:6px;">
                    {fish.address_hint && <div>📍 {fish.address_hint}</div>}
                    <div>
                      {fish.latitude.toFixed(5)}, {fish.longitude.toFixed(5)}
                      {' · '}
                      {new Date(fish.created_at).toLocaleDateString('pl-PL', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
