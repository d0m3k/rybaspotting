import { useState, useEffect } from 'preact/hooks';
import { loadAuth, clearAuth, saveAuth, AuthState } from './stores/auth';
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

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(loadAuth);
  const [page, setPage] = useState<Page>(auth ? 'map' : 'login');
  const [allowUpload, setAllowUpload] = useState(false);

  useEffect(() => {
    // Fetch config for gallery upload toggle
    if (auth) {
      fetch('/api/config')
        .then(r => r.json())
        .then(c => setAllowUpload(c.allow_gallery_upload))
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
    setPage('login');
  }

  function navigate(p: Page) {
    setPage(p);
  }

  if (!auth) {
    if (page === 'register') {
      return <RegisterPage onLogin={() => setPage('login')} />;
    }
    return <LoginPage onLogin={handleLogin} onRegister={() => setPage('register')} />;
  }

  return (
    <div class="app-container">
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
