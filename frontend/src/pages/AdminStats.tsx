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

interface CollectionEntry {
  id: number;
  fish_id: number;
  collector_name: string;
  spotter_name: string;
  latitude: number;
  longitude: number;
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
  const [collections, setCollections] = useState<CollectionEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'fish' | 'collections'>('fish');

  // Promote/demote state
  const [promoteUser, setPromoteUser] = useState('');
  const [demoteUser, setDemoteUser] = useState('');
  const [promoteMsg, setPromoteMsg] = useState('');
  const [promoteErr, setPromoteErr] = useState('');
  const [promoting, setPromoting] = useState(false);

  // Delete state
  const [deletingFish, setDeletingFish] = useState<number | null>(null);
  const [deletingColl, setDeletingColl] = useState<number | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [s, fish, coll] = await Promise.all([
        api.getAdminStats(),
        api.listAllFish(),
        api.listCollections(),
      ]);
      setStats(s);
      setFishList(fish);
      setCollections(coll);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePromote(e: Event) {
    e.preventDefault();
    const name = promoteUser.trim();
    if (!name) return;
    setPromoteErr(''); setPromoteMsg(''); setPromoting(true);
    try {
      const res: any = await api.promoteUser(name);
      setPromoteMsg(res.message);
      setPromoteUser('');
      loadData();
    } catch (err: any) {
      setPromoteErr(err.message);
    } finally { setPromoting(false); }
  }

  async function handleDemote() {
    const name = demoteUser.trim();
    if (!name) return;
    setPromoteErr(''); setPromoteMsg(''); setPromoting(true);
    try {
      const res: any = await api.demoteUser(name);
      setPromoteMsg(res.message);
      setDemoteUser('');
      loadData();
    } catch (err: any) {
      setPromoteErr(err.message);
    } finally { setPromoting(false); }
  }

  async function handleDeleteFish(fishId: number) {
    if (!confirm(`Usunąć rybę #${fishId}?`)) return;
    setDeletingFish(fishId);
    try {
      await api.deleteFish(fishId);
      setFishList(prev => prev.filter(f => f.id !== fishId));
      if (stats) setStats({ ...stats, fish_count: stats.fish_count - 1 });
    } catch (err: any) { alert(err.message); }
    finally { setDeletingFish(null); }
  }

  async function handleDeleteCollection(id: number) {
    if (!confirm(`Usunąć zebranie #${id}?`)) return;
    setDeletingColl(id);
    try {
      await api.deleteCollection(id);
      setCollections(prev => prev.filter(c => c.id !== id));
    } catch (err: any) { alert(err.message); }
    finally { setDeletingColl(null); }
  }

  if (loading) return <div class="page"><p class="loading-text">Ładowanie…</p></div>;
  if (error) return <div class="page"><h2>🔑 Admin Panel</h2><p class="error-msg">{error}</p></div>;

  return (
    <div class="page">
      <h2>🔑 Admin Panel</h2>

      {stats && (
        <div class="profile-stats" style="flex-wrap:wrap;">
          <div class="profile-stat"><div class="stats-fish-icon">👥</div><div class="stat-count spotted">{stats.user_count}</div><div class="stat-label">Użytkowników</div></div>
          <div class="profile-stat"><div class="stats-fish-icon">🐟</div><div class="stat-count collected">{stats.fish_count}</div><div class="stat-label">Ryby spotted</div></div>
          <div class="profile-stat"><div class="stats-fish-icon">🎣</div><div class="stat-count" style="color:#4ECDC4;">{collections.length}</div><div class="stat-label">Zebrań</div></div>
          <div class="profile-stat"><div class="stats-fish-icon">💾</div><div class="stat-count" style="color:#4ECDC4;">{stats.photo_size_mb}</div><div class="stat-label">MB zdjęć</div></div>
        </div>
      )}

      {/* Promote / Demote */}
      <div style="margin-top:24px;padding:16px;background:#fff;border-radius:14px;border:1px solid #F0E0D0;">
        <h3 style="margin-bottom:8px;">👑 Zarządzaj adminami</h3>
        <div style="display:flex;gap:8px;align-items:flex-end;">
          <div style="flex:1;">
            <input class="input" type="text" placeholder="Nazwa użytkownika" value={promoteUser} onInput={(e: any) => setPromoteUser(e.target.value)} style="margin-bottom:0;" />
          </div>
          <button class="btn btn-primary" onClick={handlePromote} disabled={promoting} style="width:auto;padding:12px 16px;font-size:13px;">
            {promoting ? '…' : 'Promuj'}
          </button>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;align-items:flex-end;">
          <div style="flex:1;">
            <input class="input" type="text" placeholder="Nazwa użytkownika do degradacji" value={demoteUser} onInput={(e: any) => setDemoteUser(e.target.value)} style="margin-bottom:0;" />
          </div>
          <button class="btn" onClick={handleDemote} disabled={promoting} style="width:auto;padding:12px 16px;font-size:13px;background:#E74C3C;color:#fff;border:none;border-radius:12px;cursor:pointer;min-width:auto;">
            {promoting ? '…' : 'Degraduj'}
          </button>
        </div>
        {promoteErr && <p class="error-msg" style="margin-top:8px;">{promoteErr}</p>}
        {promoteMsg && <p class="success-msg" style="margin-top:8px;">{promoteMsg}</p>}
      </div>

      {/* Tabs */}
      <div style="display:flex;gap:4px;margin-top:24px;background:#F0E0D0;border-radius:10px;padding:3px;">
        <button onClick={() => setTab('fish')} style={`flex:1;padding:8px;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;${tab === 'fish' ? 'background:#fff;color:#FF6B6B;box-shadow:0 1px 3px rgba(0,0,0,0.08);' : 'background:transparent;color:#999;'}`}>
          🐟 Ryby ({fishList.length})
        </button>
        <button onClick={() => setTab('collections')} style={`flex:1;padding:8px;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;${tab === 'collections' ? 'background:#fff;color:#4ECDC4;box-shadow:0 1px 3px rgba(0,0,0,0.08);' : 'background:transparent;color:#999;'}`}>
          🎣 Zebrania ({collections.length})
        </button>
      </div>

      {/* Fish tab */}
      {tab === 'fish' && (
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px;">
          {fishList.map(fish => (
            <div key={fish.id} style="background:#fff;border-radius:14px;border:1px solid #F0E0D0;overflow:hidden;">
              <div style="width:100%;aspect-ratio:4/3;background:#f5e8d8;overflow:hidden;">
                {fish.photo_filename ? (
                  <img src={`/api/photos/${fish.photo_filename}`} alt={`#${fish.id}`} style="width:100%;height:100%;object-fit:cover;" loading="lazy" />
                ) : <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ccc;">Brak zdjęcia</div>}
              </div>
              <div style="padding:12px;">
                <div style="display:flex;justify-content:space-between;">
                  <strong>#{fish.id}</strong> <span style="color:#E67E22;">{fish.spotter_name}</span>
                  <button onClick={() => handleDeleteFish(fish.id)} disabled={deletingFish === fish.id}
                    style="background:#E74C3C;color:#fff;border:none;border-radius:8px;padding:4px 12px;cursor:pointer;font-size:12px;">
                    {deletingFish === fish.id ? '…' : '🗑'}
                  </button>
                </div>
                <div style="font-size:12px;color:#999;margin-top:4px;">
                  {fish.address_hint && <div>📍 {fish.address_hint}</div>}
                  {fish.latitude.toFixed(5)}, {fish.longitude.toFixed(5)} · {new Date(fish.created_at).toLocaleDateString('pl-PL')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Collections tab */}
      {tab === 'collections' && (
        <div style="margin-top:16px;">
          {collections.length === 0 ? (
            <p style="text-align:center;color:#999;padding:24px;">Brak zebrań.</p>
          ) : (
            <table class="leaderboard-table" style="width:100%;">
              <thead><tr><th>ID</th><th>Zbieracz</th><th>Spotter</th><th>Data</th><th></th></tr></thead>
              <tbody>
                {collections.map(c => (
                  <tr key={c.id}>
                    <td style="font-size:12px;color:#999;">#{c.id}</td>
                    <td><strong>{c.collector_name}</strong></td>
                    <td style="font-size:12px;">{c.spotter_name}</td>
                    <td style="font-size:12px;color:#999;">{new Date(c.created_at).toLocaleDateString('pl-PL')}</td>
                    <td>
                      <button onClick={() => handleDeleteCollection(c.id)} disabled={deletingColl === c.id}
                        style="background:none;border:none;cursor:pointer;font-size:14px;">
                        {deletingColl === c.id ? '…' : '🗑'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
