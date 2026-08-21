import { useState, useEffect, useCallback } from 'preact/hooks';
import { api } from '../api';
import { navigate } from '../router';

interface Props {
  myUserId?: number;
  isAdmin?: boolean;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'przed chwilą';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min temu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} godz. temu`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} dni temu`;
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function previewText(body: string, max = 280): string {
  if (body.length <= max) return body;
  return body.slice(0, max).trimEnd() + '…';
}

export function WallPage({ myUserId, isAdmin }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api.recentComments(50);
      setItems(list);
    } catch (err: any) {
      setError(err?.message || 'Nie udało się załadować komentarzy');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(commentId: number) {
    if (!window.confirm('Usunąć komentarz?')) return;
    try {
      await api.deleteComment(commentId);
      setItems((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err: any) {
      alert(err.message);
    }
  }

  function handleGoToFish(fishId: number) {
    navigate({ page: 'map', fishId });
  }

  return (
    <div class="page">
      <div class="wall-header">
        <h2>💬 Wall komentarzy</h2>
        <p class="wall-sub">Ostatnie komentarze do rybek. Kliknij, żeby polecieć na mapę.</p>
      </div>

      {loading && <div class="wall-loading">Ładowanie…</div>}
      {error && <div class="error-msg">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div class="wall-empty">Jeszcze nikt nie skomentował żadnej rybki 🐟</div>
      )}

      <div class="wall-list">
        {items.map((c) => {
          const mine = (c.user_id ?? c.UserID) === myUserId;
          const canDelete = mine || isAdmin;
          return (
            <div class="wall-card" key={c.id}>
              <div class="wall-thumb-wrap" onClick={() => handleGoToFish(c.fish_id)}>
                <img
                  src={c.photo_url || `/api/photos/${c.photo_filename}`}
                  alt=""
                  class="wall-thumb"
                />
                <span class="wall-thumb-go" title="Pokaż na mapie">🗺️</span>
              </div>
              <div class="wall-body">
                <div class="wall-meta">
                  <span class="wall-author">{c.username}</span>
                  <span class="wall-fish">↳ ryba #{c.fish_id} ({c.spotter_name})</span>
                  <span class="wall-time">{timeAgo(c.created_at)}</span>
                </div>
                <p class="wall-text">{previewText(c.body)}</p>
                {c.address_hint && <p class="wall-addr">📍 {previewText(c.address_hint, 80)}</p>}
                <div class="wall-actions">
                  <button class="wall-go-btn" onClick={() => handleGoToFish(c.fish_id)}>
                    Pokaż na mapie →
                  </button>
                  {canDelete && (
                    <button class="wall-del-btn" onClick={() => handleDelete(c.id)} title="Usuń komentarz">
                      🗑
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && !error && items.length > 0 && (
        <button class="btn btn-secondary" style={{ marginTop: '16px' }} onClick={load} disabled={loading}>
          Odśwież
        </button>
      )}
    </div>
  );
}