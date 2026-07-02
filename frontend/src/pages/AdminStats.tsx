import { useState, useEffect } from 'preact/hooks';
import { api } from '../api';

export function AdminStatsPage() {
  const [token, setToken] = useState(localStorage.getItem('admin_token') || '');
  const [stats, setStats] = useState<{
    user_count: number;
    fish_count: number;
    photo_count: number;
    photo_size_mb: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadStats() {
    if (!token.trim()) {
      setError('Wprowadź admin token.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const s = await api.getAdminStats(token.trim());
      setStats(s);
      localStorage.setItem('admin_token', token.trim());
    } catch (err: any) {
      setError(err.message);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }

  // Auto-load on mount if token is saved
  useEffect(() => {
    if (token.trim()) loadStats();
  }, []);

  return (
    <div class="page">
      <h2>🔑 Admin Panel</h2>

      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <input
          class="input"
          type="password"
          placeholder="Admin token"
          value={token}
          onInput={(e: any) => setToken(e.target.value)}
          style="margin-bottom:0;flex:1;"
        />
        <button class="btn btn-primary" onClick={loadStats} disabled={loading} style="width:auto;padding:12px 20px;">
          {loading ? '…' : '🔍'}
        </button>
      </div>

      {error && <p class="error-msg">{error}</p>}

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
    </div>
  );
}
