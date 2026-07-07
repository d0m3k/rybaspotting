import { useState, useEffect, useRef } from 'preact/hooks';
import { api } from '../api';

import { Ryboczek } from '../components/Ryboczek';

interface Props {
  onLogin: () => void;
  onOpenPrivacy: () => void;
}

export function RegisterPage({ onLogin, onOpenPrivacy }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileKey, setTurnstileKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnstileDivRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetRef = useRef<any>(null);

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

  // Fetch config once to decide: Cloudflare Turnstile (site key present) or the
  // legacy trivia captcha.
  useEffect(() => {
    let cancelled = false;
    api.getConfig()
      .then(c => { if (!cancelled && c.turnstile_site_key) setTurnstileKey(c.turnstile_site_key); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Render the Turnstile widget once the script + site key are available.
  useEffect(() => {
    if (!turnstileKey || !turnstileDivRef.current) return;
    let cancelled = false;

    const render = (): boolean => {
      const ts = (window as any).turnstile;
      if (!ts || !turnstileDivRef.current || cancelled || turnstileWidgetRef.current != null) return !!turnstileWidgetRef.current;
      turnstileWidgetRef.current = ts.render(turnstileDivRef.current, {
        sitekey: turnstileKey,
        theme: 'light',
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
      return true;
    };

    if (!render()) {
      const iv = setInterval(() => { if (render()) clearInterval(iv); }, 200);
      return () => { cancelled = true; clearInterval(iv); };
    }
    return () => { cancelled = true; };
  }, [turnstileKey]);

  // Clean up the widget on unmount.
  useEffect(() => {
    return () => {
      const ts = (window as any).turnstile;
      if (ts && turnstileWidgetRef.current != null) {
        try { ts.remove(turnstileWidgetRef.current); } catch {}
      }
    };
  }, []);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res: any = await api.register(username, password, displayName, captcha, turnstileKey ? turnstileToken : undefined);
      setMessage(res.message || 'Rejestracja udana! Za chwilę zostaniesz przekierowany do logowania.');
      setRegistered(true);
    } catch (err: any) {
      setError(err.message);
      // Turnstile tokens are single-use — reset the widget so the user can retry.
      const ts = (window as any).turnstile;
      if (ts && turnstileWidgetRef.current != null) {
        try { ts.reset(turnstileWidgetRef.current); } catch {}
      }
      setTurnstileToken('');
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
          {/* Bot challenge: Cloudflare Turnstile when configured (/api/config
               returns turnstile_site_key); otherwise the legacy trivia captcha. */}
          {turnstileKey
            ? (
              <div
                ref={turnstileDivRef}
                style="display:flex;justify-content:center;margin-bottom:8px;min-height:65px;"
                aria-label="Weryfikacja botów"
              />
            )
            : (
              <>
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
              </>
            )}
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
            <button
              class="btn btn-primary"
              type="submit"
              disabled={loading || (turnstileKey !== '' && turnstileToken === '')}
            >
              {loading ? 'Rejestracja...' : (turnstileKey && !turnstileToken ? 'Potwierdź, że nie jesteś botem…' : 'Zarejestruj')}
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
        <p style="text-align:center;font-size:12px;margin-top:12px;">
          <span class="privacy-banner-link" onClick={onOpenPrivacy}>
            Polityka Prywatności
          </span>
        </p>
      </div>
    </div>
  );
}
