import { useState, useEffect } from 'preact/hooks';
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
import { NavBar } from './components/NavBar';

type Page = 'login' | 'register' | 'map' | 'spot' | 'upload' | 'leaderboard' | 'profile' | 'admin';

interface UserStats {
  spotted: number;
  collected: number;
  display_name: string;
}

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(loadAuth);
  const [page, setPage] = useState<Page>(auth ? 'map' : 'login');
  const [allowUpload, setAllowUpload] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    // Fetch config for gallery upload toggle
    if (auth) {
      fetch('/api/config')
        .then(r => r.json())
        .then(c => setAllowUpload(c.allow_gallery_upload))
        .catch(() => {});
      // Fetch user stats for the top-bar widget
      api.getMyStats()
        .then(s => setStats({ spotted: s.spotted, collected: s.collected, display_name: s.display_name }))
        .catch(() => {});
    }
  }, [auth]);

  function handleLogin(state: AuthState) {
    saveAuth(state);
    // Also set the raw token for the api module
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
    if (p === 'profile') {
      // Refresh stats when navigating to profile
      api.getMyStats()
        .then(s => setStats({ spotted: s.spotted, collected: s.collected, display_name: s.display_name }))
        .catch(() => {});
    }
    setPage(p);
  }

  if (!auth) {
    if (page === 'register') {
      return <RegisterPage onLogin={() => setPage('login')} />;
    }
    return <LoginPage onLogin={handleLogin} onRegister={() => setPage('register')} />;
  }

  const displayName = stats?.display_name || auth.displayName || auth.username;

  return (
    <div class="app-container">
      {/* Top bar with profile widget */}
      <header class="top-bar">
        <div class="top-bar-brand">🐟 Ryby z Dupom</div>
        <button class="profile-widget" onClick={() => navigate('profile')}>
          <span class="profile-widget-name">{displayName}</span>
          {stats && (
            <span class="profile-widget-stats">
              <span class="stat-badge stat-spotted">S {stats.spotted}</span>
              <span class="stat-badge stat-collected">C {stats.collected}</span>
            </span>
          )}
          <span class="profile-widget-avatar">
            {(displayName || '?').charAt(0).toUpperCase()}
          </span>
        </button>
      </header>

      <div class="app-content">
        {page === 'map' && <MapPage />}
        {page === 'spot' && <SpotPage />}
        {page === 'upload' && allowUpload && <UploadPage />}
        {page === 'leaderboard' && <LeaderboardPage />}
        {page === 'profile' && <ProfilePage auth={auth} onLogout={handleLogout} />}
        {page === 'admin' && <AdminStatsPage />}
      </div>
      <NavBar current={page} onNavigate={navigate} allowUpload={allowUpload} isAdmin={auth?.isAdmin ?? false} />
    </div>
  );
}
