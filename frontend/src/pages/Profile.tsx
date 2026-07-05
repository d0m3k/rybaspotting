import { useState, useEffect, useRef } from 'preact/hooks';
import { api } from '../api';
import { AuthState } from '../stores/auth';

interface UserStats {
  user_id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  spotted: number;
  collected: number;
  has_avatar: boolean;
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
  const [mySpotted, setMySpotted] = useState<any[]>([]);
  const [myCollected, setMyCollected] = useState<any[]>([]);
  const [expandedFish, setExpandedFish] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarKey, setAvatarKey] = useState(0); // cache-bust
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api.getMyStats().catch(() => null),
      api.listFish(1, 200).catch(() => []),
      api.getMyCollections().catch(() => []),
    ]).then(([s, fish, collected]) => {
      setStats(s);
      setMySpotted((fish as any[]).filter((f: any) => f.spotted_by === auth.userId));
      setMyCollected(collected as any[]);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [auth.userId]);

  async function handleSaveName(e?: Event) {
    if (e) e.preventDefault();
    const name = nameDraft.trim();
    if (!name || name === displayName) { setEditingName(false); return; }
    try {
      await api.updateDisplayName(name);
      setStats(prev => prev ? { ...prev, display_name: name } : null);
    } catch (err: any) { alert(err.message); }
    setEditingName(false);
  }

  async function handleAvatarUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      await api.uploadAvatar(formData);
      setAvatarKey(k => k + 1);
      // Refresh stats to update has_avatar
      const s = await api.getMyStats();
      setStats(s);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  const displayName = stats?.display_name || auth.displayName || auth.username;
  const initial = getInitial(displayName);
  const avatarUrl = stats?.has_avatar ? `/api/users/avatar/${auth.userId}?v=${avatarKey}` : null;

  if (loading) {
    return <div class="page"><p class="loading-text">Ładowanie profilu…</p></div>;
  }

  async function handleDeleteSpotted(fishId: number) {
    if (!confirm('Usunąć tę rybę? Zdjęcie i dane zostaną trwale usunięte.')) return;
    try {
      await api.deleteMyFish(fishId);
      setMySpotted(prev => prev.filter(f => f.id !== fishId));
    } catch (err: any) { alert(err.message); }
  }

  async function handleUncollect(fishId: number) {
    if (!confirm('Usunąć to zebranie?')) return;
    try {
      await api.uncollect(fishId);
      setMyCollected(prev => prev.filter(f => f.id !== fishId));
    } catch (err: any) { alert(err.message); }
  }

  function renderFishItem(f: any, showCollectedAt?: boolean, allowDelete?: boolean, onDelete?: (id: number) => void) {
    const isExpanded = expandedFish?.id === f.id;
    return (
      <div key={f.id + (showCollectedAt ? '-c' : '-s')} style="display: contents;">
        <div class="my-fish-item" style="cursor:pointer;position:relative;">
          <div style="display:flex;gap:12px;align-items:center;flex:1;" onClick={() => setExpandedFish(isExpanded ? null : f)}>
            <img src={`/api/photos/${f.photo_filename}`} alt="ryba" class="mini-thumb" />
            <div style="flex:1;">
              <p style="font-weight:500;font-size:14px;">
                {f.address_hint ? `📍 ${f.address_hint}` : `📍 ${f.latitude?.toFixed(4)}, ${f.longitude?.toFixed(4)}`}
              </p>
              {showCollectedAt && (
                <p class="date">Zebrana: {new Date(f.collected_at).toLocaleDateString('pl-PL')}</p>
              )}
              <p class="date">{new Date(f.created_at).toLocaleDateString('pl-PL')}</p>
            </div>
          </div>
          {allowDelete && onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(f.id); }}
              style="background:none;border:none;font-size:16px;cursor:pointer;padding:4px 8px;color:var(--text-muted);flex-shrink:0;"
              title="Usuń"
            >🗑</button>
          )}
        </div>
        {isExpanded && (
          <div style="background:var(--bg-card);border-radius:14px;padding:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);margin-bottom:8px;">
            <img src={`/api/photos/${f.photo_filename}`} alt="ryba" style="width:100%;max-height:300px;object-fit:cover;border-radius:10px;margin-bottom:8px;" />
            <p style="font-weight:600;font-size:15px;">{f.address_hint || `${f.latitude?.toFixed(5)}, ${f.longitude?.toFixed(5)}`}</p>
            {showCollectedAt && <p style="font-size:12px;color:#4ECDC4;margin-top:4px;">Zebrana: {new Date(f.collected_at).toLocaleDateString('pl-PL')}</p>}
            <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">{new Date(f.created_at).toLocaleDateString('pl-PL')}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div class="page">
      <div class="profile-header">
        {/* Avatar — clickable to upload */}
        <div
          class="profile-avatar"
          style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
          onClick={() => avatarInputRef.current?.click()}
          title="Kliknij, by zmienić zdjęcie profilowe"
        >
          {!avatarUrl && initial}
          {avatarUploading && <div class="avatar-uploading">⏳</div>}
        </div>
        {!avatarUrl && !avatarUploading && (
          <div style="font-size:10px;color:var(--text-muted);margin-top:-6px;margin-bottom:8px;cursor:pointer;" onClick={() => avatarInputRef.current?.click()}>
            kliknij, by dodać zdjęcie
          </div>
        )}
        {avatarUrl && <div style="font-size:10px;color:#4ECDC4;margin-top:-6px;margin-bottom:8px;cursor:pointer;" onClick={() => avatarInputRef.current?.click()}>zmień zdjęcie</div>}
        <input ref={avatarInputRef} type="file" accept="image/*" style="display:none;" onChange={handleAvatarUpload} />

        <div class="profile-name" onClick={() => { setNameDraft(displayName); setEditingName(true); }} title="Kliknij, by edytować">
          {editingName ? (
            <form onSubmit={handleSaveName} style="display:flex;gap:6px;justify-content:center;">
              <input
                class="input"
                type="text"
                value={nameDraft}
                onInput={(e: any) => setNameDraft(e.target.value)}
                onBlur={handleSaveName}
                maxLength={50}
                autoFocus
                style="width:180px;margin-bottom:0;font-size:16px;padding:6px 10px;text-align:center;"
              />
            </form>
          ) : (
            <>{displayName} <span style="font-size:12px;color:var(--text-muted);">✎</span></>
          )}
        </div>
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

      <button class="btn btn-logout" onClick={onLogout} style="margin-top:0;margin-bottom:20px;font-size:13px;padding:8px;">
        Wyloguj
      </button>

      <h3>Moje spotted ryby ({mySpotted.length})</h3>
      {mySpotted.length === 0 ? (
        <p style="text-align:center; color:var(--text-muted); padding: 20px 0;">
          Nie spottedowałeś jeszcze żadnej ryby. 🐟<br />
          <span style="font-size:13px;">Przejdź do zakładki <strong>Spot</strong> aby dodać pierwszą!</span>
        </p>
      ) : (
        <div class="my-fish-list">{mySpotted.map(f => renderFishItem(f, false, true, handleDeleteSpotted))}</div>
      )}

      <h3 style="margin-top:24px;">Zebrane ryby ({myCollected.length})</h3>
      {myCollected.length === 0 ? (
        <p style="text-align:center; color:var(--text-muted); padding: 20px 0;">
          Nie zebrałeś jeszcze żadnej ryby. 🎣<br />
          <span style="font-size:13px;">Znajdź rybę na <strong>Mapie</strong> i kliknij Collect!</span>
        </p>
      ) : (
        <div class="my-fish-list">{myCollected.map(f => renderFishItem(f, true, true, handleUncollect))}</div>
      )}

      <footer class="profile-footer">
        <p>
          from{' '}
          <a href="https://dom3k.pl" target="_blank" rel="noopener">dom3k</a>
          {' '}with ❤️
        </p>
        <a
          class="profile-build-hash"
          href={`https://github.com/d0m3k/rybaspotting/commit/${__BUILD_HASH__}`}
          target="_blank"
          rel="noopener"
          title="Zobacz commit na GitHub"
        >
          {__BUILD_HASH__}
        </a>
      </footer>
    </div>
  );
}
