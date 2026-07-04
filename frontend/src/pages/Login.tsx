import { useState } from 'preact/hooks';
import { api } from '../api';
import { Ryboczek } from '../components/Ryboczek';
import { AuthState } from '../stores/auth';

interface Props {
  onLogin: (state: AuthState) => void;
  onRegister: () => void;
}

export function LoginPage({ onLogin, onRegister }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(username, password);
      onLogin({
        token: res.token,
        userId: res.user_id,
        username: res.username,
        displayName: res.display_name,
        isAdmin: res.is_admin,
      });
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
        <h1 class="auth-title">Ryby z Dupom</h1>
        <p class="auth-subtitle">Spotter — Kraków</p>
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
          {error && <p class="error-msg">{error}</p>}
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Logowanie...' : 'Zaloguj'}
          </button>
        </form>
        <p class="auth-link">
          Nie masz konta?{' '}
          <span onClick={(e) => { e.preventDefault(); onRegister(); }}>
            Zarejestruj się
          </span>
        </p>
      </div>

      {/* Welcome / About section */}
      <div class="welcome-section">
        <button
          class="welcome-toggle"
          onClick={() => setShowAbout(!showAbout)}
        >
          {showAbout ? '✕' : '🐟'} O co chodzi? {showAbout ? '' : '(kliknij)'}
        </button>
        {showAbout && (
          <div class="welcome-content">
            <p>
              <strong>Ryby z Dupom</strong> to legendarne graffiti z Krakowa — ryba
              z… no cóż, z dupą. Nasza aplikacja pozwala tropić je w terenie!
            </p>
            <div class="welcome-cards">
              <div class="welcome-card welcome-spot">
                <div class="welcome-card-icon">📸</div>
                <h4>Spotting</h4>
                <p>
                  Znajdujesz <strong>nową</strong> rybę, robisz zdjęcie i zgłaszasz.
                  Zostajesz jej odkrywcą i trafia na mapę!
                </p>
              </div>
              <div class="welcome-card welcome-collect">
                <div class="welcome-card-icon">🎣</div>
                <h4>Collecting</h4>
                <p>
                  Trafiasz na <strong>już oznaczoną</strong> rybę — potwierdzasz, że
                  nadal tam jest. Dołączasz do listy zbieraczy!
                </p>
              </div>
            </div>
            <p class="welcome-footer">
              🗺️ Przeglądaj mapę, 📸 spotuj nowe ryby, 🎣 zbieraj istniejące
              i 🏆 wspinaj się w rankingu!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
