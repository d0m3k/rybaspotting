import { h } from 'preact';

type Page = 'login' | 'register' | 'map' | 'spot' | 'upload' | 'leaderboard' | 'profile';

interface NavBarProps {
  current: Page;
  onNavigate: (p: Page) => void;
  allowUpload: boolean;
}

export function NavBar({ current, onNavigate, allowUpload }: NavBarProps) {
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
    </nav>
  );
}
