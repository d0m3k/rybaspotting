import { useState } from 'preact/hooks';
import { api } from '../api';
import { LocationPicker } from './LocationPicker';

interface FishLike {
  id: number;
  latitude: number;
  longitude: number;
  address_hint?: string;
}

interface Props {
  fish: FishLike;
  /** Pass a message up to the host page (flash / alert). */
  onMessage?: (msg: string, isError?: boolean) => void;
  onDeleted?: (id: number) => void;
  onMerged?: (sourceId: number, targetId: number, res: any) => void;
  onLocationUpdated?: (id: number, lat: number, lng: number, address: string) => void;
}

/**
 * Admin-only action row for a single fish: edit location, merge, delete.
 * Self-contained (own modals) so it can be dropped into the admin panel or
 * the map's fish sheet.
 */
export function FishAdminActions({ fish, onMessage, onDeleted, onMerged, onLocationUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [mergeSource, setMergeSource] = useState<number | null>(null);
  const [mergeCandidates, setMergeCandidates] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);

  function msg(m: string, isError = false) { onMessage?.(m, isError); }

  async function handleDelete() {
    if (!confirm(`Usunąć rybę #${fish.id}?`)) return;
    setDeleting(true);
    try {
      await api.deleteFish(fish.id);
      msg(`🗑 Ryba #${fish.id} usunięta`);
      onDeleted?.(fish.id);
    } catch (err: any) {
      msg(`❌ ${err.message}`, true);
    } finally {
      setDeleting(false);
    }
  }

  async function openMerge() {
    setMergeSource(fish.id);
    setMergeCandidates([]);
    setLoadingCandidates(true);
    try {
      const cands = await api.mergeCandidates(fish.id);
      setMergeCandidates(cands);
    } catch (err: any) {
      msg(`❌ ${err.message}`, true);
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
    if (!confirm(
      `Połączyć rybę #${mergeSource} → #${targetId}?\n\n` +
      `Wszystkie zebrania i komentarze z #${mergeSource} zostaną przeniesione do #${targetId}.\n` +
      `Ryba #${mergeSource} zostanie usunięta.`
    )) return;
    setMerging(true);
    try {
      const res: any = await api.mergeFish(mergeSource, targetId);
      msg(`🔀 ${res.message} (${res.collections_moved} zebrań, ${res.comments_moved ?? 0} komentarzy)`);
      onMerged?.(mergeSource, targetId, res);
      closeMerge();
    } catch (err: any) {
      msg(`❌ ${err.message}`, true);
    } finally {
      setMerging(false);
    }
  }

  async function handleSaveLocation(newLat: number, newLng: number, address: string) {
    setSavingLocation(true);
    try {
      await api.updateFishLocation(fish.id, {
        latitude: newLat,
        longitude: newLng,
        address_hint: address || fish.address_hint,
      });
      msg(`✅ Lokalizacja ryby #${fish.id} zaktualizowana`);
      onLocationUpdated?.(fish.id, newLat, newLng, address || fish.address_hint || '');
    } catch (err: any) {
      msg(`❌ ${err.message}`, true);
    } finally {
      setSavingLocation(false);
      setEditing(false);
    }
  }

  return (
    <>
      <div class="fish-admin-actions" style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        <button
          type="button"
          onClick={() => setEditing(true)}
          style="font-size:12px;padding:5px 12px;background:var(--bg-input);color:var(--text-secondary);border:1px solid var(--border);border-radius:8px;cursor:pointer;"
        >
          📍 Edytuj lokalizację
        </button>
        <button
          type="button"
          onClick={openMerge}
          style="font-size:12px;padding:5px 12px;background:linear-gradient(135deg,#9B59B6,#8E44AD);color:#fff;border:none;border-radius:8px;cursor:pointer;"
        >
          🔀 Połącz
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          style="font-size:12px;padding:5px 12px;background:#E74C3C;color:#fff;border:none;border-radius:8px;cursor:pointer;"
        >
          {deleting ? '…' : '🗑 Usuń'}
        </button>
      </div>

      {editing && (
        <LocationPicker
          initialLat={fish.latitude}
          initialLng={fish.longitude}
          onConfirm={handleSaveLocation}
          onCancel={() => setEditing(false)}
        />
      )}

      {mergeSource !== null && (
        <div
          style="position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);"
          onClick={closeMerge}
        >
          <div
            style="background:var(--bg-card);border-radius:16px;padding:20px;max-width:500px;width:calc(100% - 32px);max-height:80vh;overflow-y:auto;"
            onClick={(e: any) => e.stopPropagation()}
          >
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
                      type="button"
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
              type="button"
              onClick={closeMerge}
              style="margin-top:16px;width:100%;padding:8px;font-size:13px;background:var(--bg-input);color:var(--text-secondary);border:1px solid var(--border);border-radius:8px;cursor:pointer;"
            >
              Zamknij
            </button>
          </div>
        </div>
      )}
    </>
  );
}
