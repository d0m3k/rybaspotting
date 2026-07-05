import { useState, useEffect } from 'preact/hooks';
import { api } from '../api';
import { Avatar } from '../components/Avatar';

export function LeaderboardPage() {
  const [data, setData] = useState<{ top_spotters: any[]; top_collectors: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.leaderboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div class="page"><p class="loading-text">Ładowanie rankingu…</p></div>;
  if (!data) return <div class="page"><p class="loading-text">Nie udało się załadować rankingu.</p></div>;

  const spotters = data.top_spotters || [];
  const collectors = data.top_collectors || [];

  function medal(i: number): string {
    if (i === 0) return '🥇';
    if (i === 1) return '🥈';
    if (i === 2) return '🥉';
    return '';
  }

  return (
    <div class="page">
      <h2>🏆 Ranking</h2>

      <div class="leaderboard-section">
        <h3>📸 Top Spotters — kto znalazł najwięcej ryb</h3>
        <table class="leaderboard-table">
          <thead>
            <tr><th>#</th><th>Użytkownik</th><th>🐟</th></tr>
          </thead>
          <tbody>
            {spotters.map((e, i) => (
              <tr key={e.username}>
                <td><span class="rank-medal">{medal(i)}</span> {i + 1}</td>
                <td style="display:flex;align-items:center;gap:8px;">
                  <Avatar userId={e.user_id} name={e.username} size={26} />
                  <strong>{e.username}</strong>
                </td>
                <td>{e.count}</td>
              </tr>
            ))}
            {spotters.length === 0 && (
              <tr><td colSpan={3} style="text-align:center;color:var(--text-muted);padding:16px;">Brak danych</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div class="leaderboard-section">
        <h3>🎣 Top Collectors — kto zebrał najwięcej</h3>
        <table class="leaderboard-table">
          <thead>
            <tr><th>#</th><th>Użytkownik</th><th>🎒</th></tr>
          </thead>
          <tbody>
            {collectors.map((e, i) => (
              <tr key={e.username}>
                <td><span class="rank-medal">{medal(i)}</span> {i + 1}</td>
                <td style="display:flex;align-items:center;gap:8px;">
                  <Avatar userId={e.user_id} name={e.username} size={26} />
                  <strong>{e.username}</strong>
                </td>
                <td>{e.count}</td>
              </tr>
            ))}
            {collectors.length === 0 && (
              <tr><td colSpan={3} style="text-align:center;color:var(--text-muted);padding:16px;">Brak danych</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
