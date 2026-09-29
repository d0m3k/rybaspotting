import { useState, useEffect } from 'preact/hooks';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { navigate } from '../router';

interface UserProfileData {
  user_id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  created_at: string;
  has_avatar: boolean;
  spotted: number;
  collected: number;
  comments: number;
  fish: any[];
  collections: any[];
  recent_comments: any[];
}

interface Props {
  userId: number;
  isMe?: boolean;
  onBack: () => void;
}

type Tab = 'spotted' | 'collected' | 'comments';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fishAddress(f: any): string {
  if (f.address_hint) return f.address_hint;
  if (f.latitude != null && f.longitude != null) {
    return `${Number(f.latitude).toFixed(5)}, ${Number(f.longitude).toFixed(5)}`;
  }
  return 'Brak lokalizacji';
}

function FishCard({ f, collectedAt, onOpen }: { f: any; collectedAt?: string; onOpen: () => void }) {
  const img = f.photo_url || (f.photo_filename ? `/api/photos/${f.photo_filename}` : '');
  return (
    <div class="my-fish-item" style="cursor:pointer;" onClick={onOpen} role="link" tabIndex={0}
      onKeyDown={(e: any) => { if (e.key === 'Enter') onOpen(); }}>
      {img ? <img src={img} alt="ryba" class="mini-thumb" /> : (
        <div class="mini-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--bg-highlight);">🐟</div>
      )}
      <div style="flex:1;min-width:0;">
        <p style="font-weight:500;font-size:14px;">#{f.id} · 📍 {fishAddress(f)}</p>
        {collectedAt && <p class="date">Zebrana: {fmtDate(collectedAt)}</p>}
        <p class="date">Dodana: {fmtDate(f.created_at)}</p>
      </div>
      <span style="color:var(--text-muted);font-size:18px;">›</span>
    </div>
  );
}

export function UserProfilePage({ userId, isMe, onBack }: Props) {
  const [data, setData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('spotted');

  useEffect(() => {
    setLoading(true);
    setError('');
    setData(null);
    api.getUser(userId)
      .then((d) => setData(d as UserProfileData))
      .catch((err: any) => setError(err?.message || 'Nie udało się załadować profilu'))
      .finally(() => setLoading(false));
  }, [userId]);

  function openFish(id: number) {
    navigate({ page: 'map', fishId: id });
  }

  if (loading) return <div class="page"><p class="loading-text">Ładowanie profilu…</p></div>;
  if (error) {
    return (
      <div class="page">
        <button class="btn btn-secondary" style="margin-bottom:16px;" onClick={onBack}>← Wróć</button>
        <p class="error-msg">{error}</p>
      </div>
    );
  }
  if (!data) return null;

  const name = data.display_name || data.username;
  const tabs: { key: Tab; label: string; count: number; emoji: string }[] = [
    { key: 'spotted', label: 'Spotted', count: data.spotted, emoji: '📸' },
    { key: 'collected', label: 'Zebrane', count: data.collected, emoji: '🎣' },
    { key: 'comments', label: 'Komentarze', count: data.comments, emoji: '💬' },
  ];

  return (
    <div class="page">
      <button class="btn btn-secondary" style="margin-bottom:16px;" onClick={onBack}>← Wróć</button>

      <div class="profile-header">
        <div class="profile-avatar" style={data.has_avatar ? { backgroundImage: `url(/api/users/avatar/${data.user_id})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
          {!data.has_avatar && (name || '?').charAt(0).toUpperCase()}
        </div>
        <div class="profile-name">
          {name}
          {data.is_admin && <span class="profile-badge badge-admin" style="margin-left:6px;">🔑 Admin</span>}
        </div>
        <div class="profile-username">@{data.username}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">
          W klubie od {fmtDate(data.created_at)}
        </div>

        <div class="profile-stats">
          <div class="profile-stat">
            <div class="stats-fish-icon">📸</div>
            <div class="stat-count spotted">{data.spotted}</div>
            <div class="stat-label">Spotted</div>
          </div>
          <div class="profile-stat">
            <div class="stats-fish-icon">🎣</div>
            <div class="stat-count collected">{data.collected}</div>
            <div class="stat-label">Zebrane</div>
          </div>
          <div class="profile-stat">
            <div class="stats-fish-icon">💬</div>
            <div class="stat-count collected">{data.comments}</div>
            <div class="stat-label">Komentarze</div>
          </div>
        </div>

        {isMe && (
          <button class="btn btn-primary" style="margin-top:14px;font-size:13px;padding:8px;" onClick={() => navigate({ page: 'profile' })}>
            ✏️ Edytuj swój profil
          </button>
        )}
      </div>

      <div class="admin-tabs" style="display:flex;gap:4px;margin-top:20px;background:var(--bg-highlight);border-radius:10px;padding:3px;">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={`flex:1;padding:8px;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;${tab === t.key ? 'background:var(--bg-card);color:#FF6B6B;box-shadow:0 1px 3px rgba(0,0,0,0.08);' : 'background:transparent;color:var(--text-muted);'}`}
          >
            {t.emoji} {t.label} ({t.count})
          </button>
        ))}
      </div>

      <div style="margin-top:16px;">
        {tab === 'spotted' && (
          data.fish.length === 0
            ? <p style="text-align:center;color:var(--text-muted);padding:20px 0;">Brak spottedowanych ryb. 🐟</p>
            : <div class="my-fish-list">{data.fish.map(f => <FishCard key={f.id} f={f} onOpen={() => openFish(f.id)} />)}</div>
        )}

        {tab === 'collected' && (
          data.collections.length === 0
            ? <p style="text-align:center;color:var(--text-muted);padding:20px 0;">Brak zebranych ryb. 🎣</p>
            : <div class="my-fish-list">{data.collections.map(f => <FishCard key={`c${f.id}`} f={f} collectedAt={f.collected_at} onOpen={() => openFish(f.id)} />)}</div>
        )}

        {tab === 'comments' && (
          data.recent_comments.length === 0
            ? <p style="text-align:center;color:var(--text-muted);padding:20px 0;">Brak komentarzy. 💬</p>
            : (
              <div style="display:flex;flex-direction:column;gap:10px;">
                {data.recent_comments.map(c => (
                  <div
                    key={c.id}
                    style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px;cursor:pointer;"
                    onClick={() => openFish(c.fish_id)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e: any) => { if (e.key === 'Enter') openFish(c.fish_id); }}
                  >
                    <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;">
                      <span style="font-size:12px;font-weight:600;color:#FF6B6B;">↳ ryba #{c.fish_id}</span>
                      <span style="font-size:11px;color:var(--text-muted);">{fmtDate(c.created_at)}</span>
                    </div>
                    <p style="font-size:14px;margin:0;">{c.body}</p>
                    {c.address_hint && <p style="font-size:11px;color:var(--text-muted);margin-top:6px;">📍 {c.address_hint}</p>}
                  </div>
                ))}
              </div>
            )
        )}
      </div>
    </div>
  );
}
