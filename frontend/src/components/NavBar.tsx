import { h } from 'preact';
import { Page } from '../router';

interface NavBarProps {
  current: Page;
  onNavigate: (p: Page) => void;
  allowUpload: boolean;
  isAdmin: boolean;
  /** Guest (logged-out) mode: the Spot button becomes a login CTA. */
  guest?: boolean;
}

export function NavBar({ current, onNavigate, allowUpload, isAdmin, guest }: NavBarProps) {
  // Left-side tabs — always just Mapa
  const leftTabs: { page: Page; label: string; icon: string }[] = [
    { page: 'map', label: 'Mapa', icon: '🗺️' },
  ];

  // Right-side tabs — Ranking + Wall always present, plus extras
  const rightTabs: { page: Page; label: string; icon: string }[] = [
    { page: 'leaderboard', label: 'Ranking', icon: '🏆' },
    { page: 'wall', label: 'Wall', icon: '💬' },
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

      {/* Center Spot button — for guests a login CTA (spotting needs an account) */}
      <div class="nav-center">
        {guest ? (
          <>
            <button
              class="nav-spot-btn"
              onClick={() => onNavigate('login')}
              aria-label="Zaloguj się"
              title="Zaloguj się, żeby spotować ryby"
            >
              <span class="nav-spot-icon">👤</span>
            </button>
            <span class="nav-spot-label">Zaloguj</span>
          </>
        ) : (
          <>
            <button
              class={`nav-spot-btn ${isSpotActive ? 'active' : ''}`}
              onClick={() => onNavigate('spot')}
              aria-label="Spotuj rybę"
            >
              <span class="nav-spot-icon">📸</span>
            </button>
            <span class="nav-spot-label">Spot</span>
          </>
        )}
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
