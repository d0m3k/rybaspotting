import { useState, useEffect } from 'preact/hooks';
import { api } from '../api';

export function AdminStatsPage() {
  const [stats, setStats] = useState<{
    user_count: number;
    fish_count: number;
    photo_count: number;
    photo_size_mb: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Promote state
  const [promoteUser, setPromoteUser] = useState('');
  const [promoteMsg, setPromoteMsg] = useState('');
  const [promoteErr, setPromoteErr] = useState('');
  const [promoting, setPromoting] = useState(false);

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    setLoading(true);
    setError('');
    try {
      const s = await api.getAdminStats();
      setStats(s);
    } catch (err: any) {
      setError(err.message);
      setStats(null);
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
      loadStats(); // refresh counts
    } catch (err: any) {
      setPromoteErr(err.message);
    } finally {
      setPromoting(false);
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
    </div>
  );
}
