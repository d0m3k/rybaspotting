import { useState } from 'preact/hooks';
import { api } from '../api';

interface Props {
  onLogin: () => void;
}

export function RegisterPage({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res: any = await api.register(username, password, displayName);
      setMessage(res.message || 'Rejestracja udana!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="auth-page">
      <div class="auth-card">
        <h1 class="auth-title">Rejestracja</h1>
        <form onSubmit={handleSubmit}>
          <input
            class="input"
            type="text"
            placeholder="Nazwa użytkownika"
            value={username}
            onInput={(e: any) => setUsername(e.target.value)}
            required
          />
          <input
            class="input"
            type="password"
            placeholder="Hasło"
            value={password}
            onInput={(e: any) => setPassword(e.target.value)}
            required
          />
          <input
            class="input"
            type="text"
            placeholder="Wyświetlana nazwa (opcjonalnie)"
            value={displayName}
            onInput={(e: any) => setDisplayName(e.target.value)}
          />
          {error && <p class="error-msg">{error}</p>}
          {message && <p class="success-msg">{message}</p>}
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Rejestracja...' : 'Zarejestruj'}
          </button>
        </form>
        <p class="auth-link">
          Masz już konto?{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); onLogin(); }}>
            Zaloguj się
          </a>
        </p>
      </div>
    </div>
  );
}
