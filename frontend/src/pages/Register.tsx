import { useState, useEffect, useRef } from 'preact/hooks';
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
  const [registered, setRegistered] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!registered) return;
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) return 0;
        return c - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [registered]);

  useEffect(() => {
    if (countdown === 0) {
      onLogin();
    }
  }, [countdown]);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res: any = await api.register(username, password, displayName, captcha);
      setMessage(res.message || 'Rejestracja udana! Za chwilę zostaniesz przekierowany do logowania.');
      setRegistered(true);
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
            autocomplete="username"
            autocapitalize="off"
          />
          <input
            class="input"
            type="password"
            placeholder="Hasło"
            value={password}
            onInput={(e: any) => setPassword(e.target.value)}
            required
            autocomplete="new-password"
          />
          <input
            class="input"
            type="text"
            placeholder="Wyświetlana nazwa (opcjonalnie)"
            value={displayName}
            onInput={(e: any) => setDisplayName(e.target.value)}
          />
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;text-align:center;">
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
            autocapitalize="off"
          />
          {error && <p class="error-msg">{error}</p>}
          {message && (
            <div class="success-box">
              <p class="success-msg">{message}</p>
              {registered && countdown > 0 && (
                <p class="success-countdown">Przekierowanie za {countdown}s…</p>
              )}
              <button class="btn btn-primary" type="button" onClick={onLogin}>
                Zaloguj się teraz ➜
              </button>
            </div>
          )}
          {!registered && (
            <button class="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Rejestracja...' : 'Zarejestruj'}
            </button>
          )}
        </form>
        {!registered && (
          <p class="auth-link">
            Masz już konto?{' '}
            <span onClick={(e) => { e.preventDefault(); onLogin(); }}>
              Zaloguj się
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
