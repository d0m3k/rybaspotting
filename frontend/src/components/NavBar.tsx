import { h } from 'preact';

type Page = 'login' | 'register' | 'map' | 'spot' | 'upload' | 'leaderboard' | 'profile' | 'admin';

interface NavBarProps {
  current: Page;
  onNavigate: (p: Page) => void;
  allowUpload: boolean;
  isAdmin: boolean;
}

export function NavBar({ current, onNavigate, allowUpload, isAdmin }: NavBarProps) {
  const tabs: { page: Page; label: string; icon: string }[] = [
    { page: 'map', label: 'Mapa', icon: '🗺️' },
    { page: 'spot', label: 'Spot', icon: '📸' },
  ];
  if (allowUpload) {
    tabs.push({ page: 'upload', label: 'Wgraj', icon: '📂' });
  }
  tabs.push(
    { page: 'leaderboard', label: 'Ranking', icon: '🏆' },
    { page: 'profile', label: 'Profil', icon: '👤' },
  );
  if (isAdmin) {
    tabs.push({ page: 'admin', label: 'Admin', icon: '🔑' });
  }

  return (
    <nav class="nav-bar">
      {tabs.map(tab => (
        <button
          key={tab.page}
          class={`nav-btn ${current === tab.page ? 'active' : ''}`}
          onClick={() => onNavigate(tab.page)}
        >
          <span class="nav-icon">{tab.icon}</span>
          <span class="nav-label">{tab.label}</span>
        </button>
      ))}
      <div style="position:absolute;top:-12px;right:4px;font-size:9px;color:#ccc;background:#FFF8F0;padding:0 3px;border-radius:3px;">
        {__BUILD_HASH__}
      </div>
    </nav>
  );
}
