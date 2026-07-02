import { useState, useEffect } from 'preact/hooks';
import { api } from '../api';

export function LeaderboardPage() {
  const [data, setData] = useState<{ top_spotters: any[]; top_collectors: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.leaderboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div class="page"><p>Ładowanie...</p></div>;

  return (
    <div class="page">
      <h2>🏆 Ranking</h2>

      <h3>Top Spotters (kto znalazł najwięcej ryb)</h3>
      <table class="leaderboard-table">
        <thead>
          <tr><th>#</th><th>Użytkownik</th><th>Ryby</th></tr>
        </thead>
        <tbody>
          {data?.top_spotters.map((e, i) => (
            <tr key={e.username}>
              <td>{i + 1}</td>
              <td>{e.username}</td>
              <td>{e.count}</td>
            </tr>
          ))}
          {data?.top_spotters.length === 0 && (
            <tr><td colSpan={3}>Brak danych</td></tr>
          )}
        </tbody>
      </table>

      <h3>Top Collectors (kto zebrał najwięcej)</h3>
      <table class="leaderboard-table">
        <thead>
          <tr><th>#</th><th>Użytkownik</th><th>Kolekcje</th></tr>
        </thead>
        <tbody>
          {data?.top_collectors.map((e, i) => (
            <tr key={e.username}>
              <td>{i + 1}</td>
              <td>{e.username}</td>
              <td>{e.count}</td>
            </tr>
          ))}
          {data?.top_collectors.length === 0 && (
            <tr><td colSpan={3}>Brak danych</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
