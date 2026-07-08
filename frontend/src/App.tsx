import { useState, useEffect, useCallback } from 'preact/hooks';
import { loadAuth, clearAuth, saveAuth, AuthState } from './stores/auth';
import { api } from './api';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { MapPage } from './pages/Map';
import { SpotPage } from './pages/Spot';
import { UploadPage } from './pages/Upload';
import { LeaderboardPage } from './pages/Leaderboard';
import { ProfilePage } from './pages/Profile';
import { AdminStatsPage } from './pages/AdminStats';
import { PrivacyPolicyPage } from './pages/PrivacyPolicy';
import { NavBar } from './components/NavBar';
import { PrivacyBanner } from './components/PrivacyBanner';

type Page = 'login' | 'register' | 'map' | 'spot' | 'upload' | 'leaderboard' | 'profile' | 'admin' | 'privacy';

interface UserStats {
  spotted: number;
  collected: number;
  display_name: string;
  has_avatar: boolean;
  user_id: number;
}

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(loadAuth);
  const [page, setPage] = useState<Page>(auth ? 'map' : 'login');
  const [allowUpload, setAllowUpload] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [hideNav, setHideNav] = useState(false);

  // Dark mode
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
    localStorage.setItem('darkMode', String(dark));
  }, [dark]);

  const refreshStats = useCallback(() => {
    api.getMyStats()
      .then(s => setStats({ spotted: s.spotted, collected: s.collected, display_name: s.display_name, has_avatar: s.has_avatar, user_id: s.user_id }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Fetch config for gallery upload toggle
    if (auth) {
      fetch('/api/config')
        .then(r => r.json())
        .then(c => setAllowUpload(c.allow_gallery_upload))
        .catch(() => {});
      refreshStats();
    }
  }, [auth, refreshStats]);

  function handleLogin(state: AuthState) {
    saveAuth(state);
    localStorage.setItem('token', state.token);
    setAuth(state);
    setPage('map');
  }

  function handleLogout() {
    clearAuth();
    setAuth(null);
    setStats(null);
    setPage('login');
  }

  function navigate(p: Page) {
    setHideNav(false);
    if (p === 'profile') {
      refreshStats();
    }
    setPage(p);
  }

  if (!auth) {
    if (page === 'register') {
      return (
        <div class="app-container">
          <div class="app-content">
            <RegisterPage onLogin={() => setPage('login')} onOpenPrivacy={() => setPage('privacy')} />
          </div>
          <PrivacyBanner onOpenPolicy={() => setPage('privacy')} />
        </div>
      );
    }
    if (page === 'privacy') {
      return (
        <div class="app-container">
          <div class="app-content">
            <PrivacyPolicyPage onBack={() => setPage('login')} />
          </div>
          <PrivacyBanner onOpenPolicy={() => setPage('privacy')} />
        </div>
      );
    }
    return (
      <div class="app-container">
        <div class="app-content">
          <LoginPage onLogin={handleLogin} onRegister={() => setPage('register')} onOpenPrivacy={() => setPage('privacy')} />
        </div>
        <PrivacyBanner onOpenPolicy={() => setPage('privacy')} />
      </div>
    );
  }

  const displayName = stats?.display_name || auth.displayName || auth.username;

  return (
    <div class="app-container">
      {/* Top bar with profile widget — hidden when nav is hidden (spot confirm mode) */}
      {!hideNav && (
        <header class="top-bar">
          <div class="top-bar-brand">🐟 Ryby z Dupom</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <button class="dark-toggle" onClick={() => setDark(d => !d)} title={dark ? 'Tryb jasny' : 'Tryb ciemny'}>
              {dark ? '☀️' : '🌙'}
            </button>
          <button class="profile-widget" onClick={() => navigate('profile')}>
            <span class="profile-widget-name">{displayName}</span>
            {stats && (
              <span class="profile-widget-stats">
                <span class="stat-badge stat-spotted">S {stats.spotted}</span>
                <span class="stat-badge stat-collected">C {stats.collected}</span>
              </span>
            )}
            {stats?.has_avatar ? (
              <span class="profile-widget-avatar" style={{ backgroundImage: `url(/api/users/avatar/${stats.user_id})`, backgroundSize: 'cover', backgroundPosition: 'center' }}></span>
            ) : (
              <span class="profile-widget-avatar">
                {(displayName || '?').charAt(0).toUpperCase()}
              </span>
            )}
          </button>
          </div>
        </header>
      )}

      <div class="app-content">
        {page === 'map' && <MapPage onStatsChanged={refreshStats} userId={auth.userId} username={auth.username} dark={dark} />}
        {page === 'spot' && <SpotPage onHideNav={setHideNav} onStatsChanged={refreshStats} />}
        {page === 'upload' && allowUpload && <UploadPage onStatsChanged={refreshStats} />}
        {page === 'leaderboard' && <LeaderboardPage />}
        {page === 'profile' && <ProfilePage auth={auth} onLogout={handleLogout} onOpenPrivacy={() => setPage('privacy')} />}
        {page === 'admin' && <AdminStatsPage />}
        {page === 'privacy' && <PrivacyPolicyPage onBack={() => setPage(auth ? 'map' : 'login')} />}
      </div>
      {!hideNav && page !== 'privacy' && <NavBar current={page} onNavigate={navigate} allowUpload={allowUpload} isAdmin={auth?.isAdmin ?? false} />}
      <PrivacyBanner onOpenPolicy={() => setPage('privacy')} />
    </div>
  );
}
