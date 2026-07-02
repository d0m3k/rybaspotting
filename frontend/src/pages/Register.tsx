import { useState } from 'preact/hooks';
import { api } from '../api';

import { Ryboczek } from '../components/Ryboczek';

interface Props {
  onLogin: () => void;
}

export function RegisterPage({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res: any = await api.register(username, password, displayName, captcha);
      setMessage(res.message || 'Rejestracja udana! Możesz się teraz zalogować.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-mascot">
          <Ryboczek size={100} />
        </div>
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
          <p style="font-size:13px;color:#7F8C8D;margin-bottom:8px;text-align:center;">
            🐟 Pytanie-ryba: <strong>„Ryby z czym?"</strong> (jedno słowo)
          </p>
          <input
            class="input"
            type="text"
            placeholder="Twoja odpowiedź…"
            value={captcha}
            onInput={(e: any) => setCaptcha(e.target.value)}
            required
            autocomplete="off"
          />
          {error && <p class="error-msg">{error}</p>}
          {message && <p class="success-msg">{message}</p>}
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Rejestracja...' : 'Zarejestruj'}
          </button>
        </form>
        <p class="auth-link">
          Masz już konto?{' '}
          <span onClick={(e) => { e.preventDefault(); onLogin(); }}>
            Zaloguj się
          </span>
        </p>
      </div>
    </div>
  );
}
