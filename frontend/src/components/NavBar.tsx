import { h } from 'preact';

type Page = 'login' | 'register' | 'map' | 'spot' | 'upload' | 'leaderboard' | 'profile' | 'admin';

interface NavBarProps {
  current: Page;
  onNavigate: (p: Page) => void;
  allowUpload: boolean;
  isAdmin: boolean;
}

export function NavBar({ current, onNavigate, allowUpload, isAdmin }: NavBarProps) {
  // Left-side tabs — always just Mapa
  const leftTabs: { page: Page; label: string; icon: string }[] = [
    { page: 'map', label: 'Mapa', icon: '🗺️' },
  ];

  // Right-side tabs — Ranking always present, plus extras
  const rightTabs: { page: Page; label: string; icon: string }[] = [
    { page: 'leaderboard', label: 'Ranking', icon: '🏆' },
  ];
  if (allowUpload) {
    rightTabs.push({ page: 'upload', label: 'Wgraj', icon: '📂' });
  }
  if (isAdmin) {
    rightTabs.push({ page: 'admin', label: 'Admin', icon: '🔑' });
  }

  const isSpotActive = current === 'spot';

  return (
    <nav class="nav-bar">
      {/* Background bar behind everything */}
      <div class="nav-bar-bg"></div>

      {/* Left side — 1 tab */}
      <div class="nav-side nav-left">
        {leftTabs.map(tab => (
          <button
            key={tab.page}
            class={`nav-btn ${current === tab.page ? 'active' : ''}`}
            onClick={() => onNavigate(tab.page)}
          >
            <span class="nav-icon">{tab.icon}</span>
            <span class="nav-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Center Spot button */}
      <div class="nav-center">
        <button
          class={`nav-spot-btn ${isSpotActive ? 'active' : ''}`}
          onClick={() => onNavigate('spot')}
          aria-label="Spotuj rybę"
        >
          <span class="nav-spot-icon">📸</span>
        </button>
        <span class="nav-spot-label">Spot</span>
      </div>

      {/* Right side — Ranking + extras */}
      <div class="nav-side nav-right">
        {rightTabs.map(tab => (
          <button
            key={tab.page}
            class={`nav-btn ${current === tab.page ? 'active' : ''}`}
            onClick={() => onNavigate(tab.page)}
          >
            <span class="nav-icon">{tab.icon}</span>
            <span class="nav-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
