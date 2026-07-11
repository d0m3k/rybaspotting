import { useState, useEffect } from 'preact/hooks';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { LocationPicker } from '../components/LocationPicker';

interface MergeCandidate {
  id: number;
  photo_filename: string;
  photo_url?: string;
  latitude: number;
  longitude: number;
  address_hint: string;
  spotted_by: number;
  spotter_name: string;
  created_at: string;
  distance_meters: number;
}

interface UserEntry {
  id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  spots: number;
  collects: number;
  created_at: string;
  deleted_at: string | null;
}

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

type Tab = 'users' | 'fish' | 'collections';

export function AdminStatsPage() {
  const [stats, setStats] = useState<{
    user_count: number;
    fish_count: number;
    photo_count: number;
    photo_size_mb: number;
  } | null>(null);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [fishList, setFishList] = useState<FishEntry[]>([]);
  const [collections, setCollections] = useState<CollectionEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('users');

  // Action feedback
  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [actingUser, setActingUser] = useState<string | null>(null);

  // Delete state
  const [deletingFish, setDeletingFish] = useState<number | null>(null);
  const [deletingColl, setDeletingColl] = useState<number | null>(null);

  // Location editing state
  const [editingFish, setEditingFish] = useState<FishEntry | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);

  // Merge state
  const [mergeSource, setMergeSource] = useState<number | null>(null);
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [merging, setMerging] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [s, u, fish, coll] = await Promise.all([
        api.getAdminStats(),
        api.listUsers(),
        api.listAllFish(),
        api.listCollections(),
      ]);
      setStats(s);
      setUsers(u);
      setFishList(fish);
      setCollections(coll);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function flash(msg: string, isError = false) {
    if (isError) {
      setActionErr(msg);
      setActionMsg('');
    } else {
      setActionMsg(msg);
      setActionErr('');
    }
    setActingUser(null);
    setTimeout(() => { setActionMsg(''); setActionErr(''); }, 3000);
  }

  async function handlePromote(username: string) {
    setActingUser(username);
    try {
      await api.promoteUser(username);
      setUsers(prev => prev.map(u => u.username === username ? { ...u, is_admin: true } : u));
      flash(`✅ ${username} promoted to admin`);
    } catch (err: any) {
      flash(`❌ ${err.message}`, true);
    }
  }

  async function handleDemote(username: string) {
    setActingUser(username);
    try {
      await api.demoteUser(username);
      setUsers(prev => prev.map(u => u.username === username ? { ...u, is_admin: false } : u));
      flash(`⬇ ${username} demoted`);
    } catch (err: any) {
      flash(`❌ ${err.message}`, true);
    }
  }

  async function handleSetPassword(username: string) {
    const pw = prompt(`Nowe hasło dla użytkownika „${username}” (min. 4 znaki):`);
    if (!pw) return;
    if (pw.length < 4) {
      flash('❌ Hasło musi mieć przynajmniej 4 znaki', true);
      return;
    }
    setActingUser(username);
    try {
      await api.setPassword(username, pw);
      flash(`🔑 Hasło dla ${username} zostało zmienione`);
    } catch (err: any) {
      flash(`❌ ${err.message}`, true);
    }
  }

  async function handleDeleteUser(username: string) {
    if (!confirm(`Usunąć użytkownika „${username}”?\n\nJeśli ma spotted ryby — zostanie zanonimizowany.\nJeśli nie ma żadnych ryb — zostanie usunięty trwale.`)) return;
    setActingUser(username);
    try {
      const res: any = await api.deleteUser(username);
      flash(`🗑 ${res.message}`);
      loadData();
    } catch (err: any) {
      flash(`❌ ${err.message}`, true);
    }
  }

  async function handleRestoreUser(username: string) {
    if (!confirm(`Przywrócić użytkownika „${username}”?`)) return;
    setActingUser(username);
    try {
      const res: any = await api.restoreUser(username);
      flash(`↩ ${res.message}`);
      loadData();
    } catch (err: any) {
      flash(`❌ ${err.message}`, true);
    }
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

  // ── Location editing (via map picker) ──
  async function handleSaveLocation(newLat: number, newLng: number, address: string) {
    if (!editingFish) return;
    setSavingLocation(true);
    try {
      await api.updateFishLocation(editingFish.id, {
        latitude: newLat,
        longitude: newLng,
        address_hint: address || editingFish.address_hint,
      });
      setFishList(prev => prev.map(f =>
        f.id === editingFish.id ? { ...f, latitude: newLat, longitude: newLng, address_hint: address || editingFish.address_hint } : f
      ));
      flash(`✅ Lokalizacja ryby #${editingFish.id} zaktualizowana`);
    } catch (err: any) {
      flash(`❌ ${err.message}`, true);
    } finally {
      setSavingLocation(false);
      setEditingFish(null);
    }
  }

  // ── Merge ──
  async function openMerge(fishId: number) {
    setMergeSource(fishId);
    setMergeCandidates([]);
    setLoadingCandidates(true);
    try {
      const cands = await api.mergeCandidates(fishId);
      setMergeCandidates(cands);
    } catch (err: any) {
      flash(`❌ ${err.message}`, true);
      setMergeSource(null);
    } finally {
      setLoadingCandidates(false);
    }
  }

  function closeMerge() {
    setMergeSource(null);
    setMergeCandidates([]);
  }

  async function handleMerge(targetId: number) {
    if (!mergeSource) return;
    if (!confirm(`Połączyć rybę #${mergeSource} → #${targetId}?\n\nWszystkie zebrania z #${mergeSource} zostaną przeniesione do #${targetId}.\nRyba #${mergeSource} zostanie usunięta.`)) return;
    setMerging(true);
    try {
      const res: any = await api.mergeFish(mergeSource, targetId);
      flash(`🔀 ${res.message} (${res.collections_moved} zebrań przeniesionych)`);
      // Remove source from list
      setFishList(prev => prev.filter(f => f.id !== mergeSource));
      if (stats) setStats({ ...stats, fish_count: stats.fish_count - 1 });
      closeMerge();
    } catch (err: any) {
      flash(`❌ ${err.message}`, true);
    } finally {
      setMerging(false);
    }
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

  const tabs: { key: Tab; label: string; count: number; emoji: string }[] = [
    { key: 'users', label: 'Użytkownicy', count: users.length, emoji: '👥' },
    { key: 'fish', label: 'Ryby', count: fishList.length, emoji: '🐟' },
    { key: 'collections', label: 'Zebrania', count: collections.length, emoji: '🎣' },
  ];

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

      {/* Flash messages */}
      {(actionMsg || actionErr) && (
        <p class={actionErr ? 'error-msg' : 'success-msg'} style="margin-top:12px;">
          {actionMsg || actionErr}
        </p>
      )}

      {/* Tabs */}
      <div class="admin-tabs" style="display:flex;gap:4px;margin-top:20px;background:var(--bg-highlight);border-radius:10px;padding:3px;">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            class="admin-tab-btn"
            style={`flex:1;padding:8px;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;${tab === t.key ? 'background:var(--bg-card);color:#FF6B6B;box-shadow:0 1px 3px rgba(0,0,0,0.08);' : 'background:transparent;color:var(--text-muted);'}`}
          >
            {t.emoji} {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* ── Users tab ── */}
      {tab === 'users' && (
        <div class="admin-user-list" style="margin-top:16px;display:flex;flex-direction:column;gap:10px;">
          {users.map(user => {
            const isDeleted = !!user.deleted_at;
            return (
            <div key={user.id} class="admin-user-card" style={`background:var(--bg-card);border-radius:14px;padding:14px;border:1px solid var(--border);${isDeleted ? 'opacity:0.65;' : ''}`}>
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                <div style="min-width:0;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <Avatar userId={user.id} name={user.display_name || user.username} size={32} />
                    <strong style={`font-size:15px;${isDeleted ? 'text-decoration:line-through;' : ''}`}>{user.display_name || user.username}</strong>
                    {user.is_admin && <span style="background:#FF6B6B;color:#fff;font-size:10px;padding:1px 6px;border-radius:4px;font-weight:600;">ADMIN</span>}
                    {isDeleted && <span style="background:#E74C3C;color:#fff;font-size:10px;padding:1px 6px;border-radius:4px;font-weight:600;">🚫 USUNIĘTY</span>}
                  </div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">@{user.username} · od {new Date(user.created_at).toLocaleDateString('pl-PL')}{isDeleted ? ` · usunięty ${new Date(user.deleted_at!).toLocaleDateString('pl-PL')}` : ''}</div>
                </div>
                <div style="display:flex;gap:12px;text-align:center;">
                  <div><div style="font-weight:700;font-size:16px;color:#FF6B6B;">{user.spots}</div><div style="font-size:11px;color:var(--text-muted);">spotów</div></div>
                  <div><div style="font-weight:700;font-size:16px;color:#4ECDC4;">{user.collects}</div><div style="font-size:11px;color:var(--text-muted);">zebrań</div></div>
                </div>
              </div>
              <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
                {!isDeleted && (
                  <>
                    {user.is_admin ? (
                      <button
                        class="btn btn-sm btn-danger"
                        onClick={() => handleDemote(user.username)}
                        disabled={actingUser === user.username}
                        style="font-size:12px;padding:5px 12px;background:#E74C3C;color:#fff;border:none;border-radius:8px;cursor:pointer;"
                      >
                        {actingUser === user.username ? '…' : '⬇ Degraduj'}
                      </button>
                    ) : (
                      <button
                        class="btn btn-sm"
                        onClick={() => handlePromote(user.username)}
                        disabled={actingUser === user.username}
                        style="font-size:12px;padding:5px 12px;background:linear-gradient(135deg,#FF6B6B,#FF8E72);color:#fff;border:none;border-radius:8px;cursor:pointer;"
                      >
                        {actingUser === user.username ? '…' : '👑 Promuj'}
                      </button>
                    )}
                    <button
                      class="btn btn-sm"
                      onClick={() => handleSetPassword(user.username)}
                      disabled={actingUser === user.username}
                      style="font-size:12px;padding:5px 12px;background:var(--bg-input);color:var(--text-secondary);border:1px solid var(--border);border-radius:8px;cursor:pointer;"
                    >
                      {actingUser === user.username ? '…' : '🔑 Hasło'}
                    </button>
                    <button
                      class="btn btn-sm"
                      onClick={() => handleDeleteUser(user.username)}
                      disabled={actingUser === user.username}
                      style="font-size:12px;padding:5px 12px;background:transparent;color:#E74C3C;border:1px solid #E74C3C;border-radius:8px;cursor:pointer;"
                    >
                      {actingUser === user.username ? '…' : '🗑 Usuń'}
                    </button>
                  </>
                )}
                {isDeleted && (
                  <button
                    class="btn btn-sm"
                    onClick={() => handleRestoreUser(user.username)}
                    disabled={actingUser === user.username}
                    style="font-size:12px;padding:5px 12px;background:linear-gradient(135deg,#2ECC71,#27AE60);color:#fff;border:none;border-radius:8px;cursor:pointer;"
                  >
                    {actingUser === user.username ? '…' : '↩ Przywróć'}
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* ── Fish tab ── */}
      {tab === 'fish' && (
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px;">
          {/* Map picker overlay for location editing */}
          {editingFish && (
            <LocationPicker
              initialLat={editingFish.latitude}
              initialLng={editingFish.longitude}
              onConfirm={(newLat, newLng, address) => handleSaveLocation(newLat, newLng, address)}
              onCancel={() => setEditingFish(null)}
            />
          )}

          {fishList.map(fish => (
            <div key={fish.id} style="background:var(--bg-card);border-radius:14px;border:1px solid var(--border);overflow:hidden;">
              <div style="width:100%;aspect-ratio:4/3;background:var(--bg-highlight);overflow:hidden;">
                {fish.photo_filename ? (
                  <img src={fish.photo_url || `/api/photos/${fish.photo_filename}`} alt={`#${fish.id}`} style="width:100%;height:100%;object-fit:cover;" loading="lazy" />
                ) : <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);">Brak zdjęcia</div>}
              </div>
              <div style="padding:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                  <strong>#{fish.id}</strong>
                  <span style="color:#E67E22;font-size:13px;">{fish.spotter_name}</span>
                  <span style="font-size:11px;color:var(--text-muted);">{new Date(fish.created_at).toLocaleDateString('pl-PL')}</span>
                </div>

                <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">
                  {fish.address_hint && <div>📍 {fish.address_hint}</div>}
                  <div style="margin-top:2px;">{fish.latitude.toFixed(5)}, {fish.longitude.toFixed(5)}</div>
                </div>

                <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
                  <button
                    onClick={() => setEditingFish(fish)}
                    style="font-size:12px;padding:5px 12px;background:var(--bg-input);color:var(--text-secondary);border:1px solid var(--border);border-radius:8px;cursor:pointer;"
                  >
                    📍 Edytuj lokalizację
                  </button>
                  <button
                    onClick={() => openMerge(fish.id)}
                    style="font-size:12px;padding:5px 12px;background:linear-gradient(135deg,#9B59B6,#8E44AD);color:#fff;border:none;border-radius:8px;cursor:pointer;"
                  >
                    🔀 Połącz
                  </button>
                  <button
                    onClick={() => handleDeleteFish(fish.id)}
                    disabled={deletingFish === fish.id}
                    style="font-size:12px;padding:5px 12px;background:#E74C3C;color:#fff;border:none;border-radius:8px;cursor:pointer;"
                  >
                    {deletingFish === fish.id ? '…' : '🗑 Usuń'}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* ── Merge modal ── */}
          {mergeSource !== null && (
            <div style="position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);" onClick={closeMerge}>
              <div style="background:var(--bg-card);border-radius:16px;padding:20px;max-width:500px;width:calc(100% - 32px);max-height:80vh;overflow-y:auto;" onClick={(e: any) => e.stopPropagation()}>
                <h3 style="margin:0 0 4px;">🔀 Połącz rybę #{mergeSource}</h3>
                <p style="font-size:13px;color:var(--text-muted);margin:0 0 16px;">Wybierz rybę, z którą chcesz połączyć — posortowane wg odległości.</p>

                {loadingCandidates ? (
                  <p style="text-align:center;color:var(--text-muted);">Ładowanie kandydatów…</p>
                ) : mergeCandidates.length === 0 ? (
                  <p style="text-align:center;color:var(--text-muted);">Brak innych ryb do połączenia.</p>
                ) : (
                  <div style="display:flex;flex-direction:column;gap:8px;">
                    {mergeCandidates.map(c => (
                      <div key={c.id} style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-highlight);border-radius:10px;border:1px solid var(--border);">
                        <div style="width:48px;height:48px;border-radius:8px;overflow:hidden;flex-shrink:0;background:var(--bg-input);">
                          {c.photo_filename ? (
                            <img src={c.photo_url || `/api/photos/${c.photo_filename}`} alt={`#${c.id}`} style="width:100%;height:100%;object-fit:cover;" />
                          ) : <div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:18px;">🐟</div>}
                        </div>
                        <div style="flex:1;min-width:0;">
                          <div style="font-weight:600;font-size:14px;">#{c.id} <span style="color:#E67E22;font-weight:400;">{c.spotter_name}</span></div>
                          <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            {c.address_hint && <>📍 {c.address_hint} · </>}
                            {c.distance_meters < 1000
                              ? `${c.distance_meters.toFixed(0)} m`
                              : `${(c.distance_meters / 1000).toFixed(1)} km`}
                          </div>
                        </div>
                        <button
                          onClick={() => handleMerge(c.id)}
                          disabled={merging}
                          style="flex-shrink:0;padding:6px 14px;font-size:12px;background:linear-gradient(135deg,#9B59B6,#8E44AD);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;"
                        >
                          {merging ? '…' : 'Połącz →'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={closeMerge}
                  style="margin-top:16px;width:100%;padding:8px;font-size:13px;background:var(--bg-input);color:var(--text-secondary);border:1px solid var(--border);border-radius:8px;cursor:pointer;"
                >
                  Zamknij
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Collections tab ── */}
      {tab === 'collections' && (
        <div style="margin-top:16px;">
          {collections.length === 0 ? (
            <p style="text-align:center;color:var(--text-muted);padding:24px;">Brak zebrań.</p>
          ) : (
            <table class="leaderboard-table" style="width:100%;">
              <thead><tr><th>ID</th><th>Zbieracz</th><th>Spotter</th><th>Data</th><th></th></tr></thead>
              <tbody>
                {collections.map(c => (
                  <tr key={c.id}>
                    <td style="font-size:12px;color:var(--text-muted);">#{c.id}</td>
                    <td><strong>{c.collector_name}</strong></td>
                    <td style="font-size:12px;">{c.spotter_name}</td>
                    <td style="font-size:12px;color:var(--text-muted);">{new Date(c.created_at).toLocaleDateString('pl-PL')}</td>
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
