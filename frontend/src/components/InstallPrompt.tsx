import { useState, useEffect } from 'preact/hooks';

// --- Platform detection helpers ---

function isStandalone(): boolean {
  if (typeof window === 'undefined') return true;
  // iOS Safari standalone mode
  if ((navigator as any).standalone) return true;
  // Standard display-mode check
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return false;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
}

// --- Types ---

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// --- Constants ---

const DISMISS_KEY = 'pwa_install_dismissed';

// --- Component ---

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState<'android' | 'ios' | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show anything if already installed as PWA
    if (isStandalone()) return;

    // Don't show if user previously dismissed
    if (localStorage.getItem(DISMISS_KEY) === 'true') {
      setDismissed(true);
      return;
    }

    // Android / Chromium: listen for the native install prompt event
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // suppress the browser's own mini-infobar
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner('android');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS: no beforeinstallprompt — show instructions after a short delay
    if (isIOS()) {
      const timer = setTimeout(() => setShowBanner('ios'), 3000);
      return () => {
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
        clearTimeout(timer);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    };
  }, []);

  // --- Handlers ---

  function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((result) => {
      if (result.outcome === 'accepted') {
        setShowBanner(null); // hide banner, they installed
      }
      setDeferredPrompt(null);
    });
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, 'true');
    setShowBanner(null);
    setDismissed(true);
  }

  if (!showBanner || dismissed) return null;

  // --- Android / Chromium banner ---
  if (showBanner === 'android') {
    return (
      <div class="install-banner">
        <button class="install-banner-close" onClick={handleDismiss} aria-label="Zamknij">
          ✕
        </button>
        <div class="install-banner-body">
          <span class="install-banner-icon">🐟</span>
          <div class="install-banner-text">
            <strong>Zainstaluj aplikację</strong>
            <span>Szybki dostęp do mapy, nawet offline</span>
          </div>
        </div>
        <button class="install-banner-install" onClick={handleInstall}>
          Instaluj
        </button>
      </div>
    );
  }

  // --- iOS install guide ---
  if (showBanner === 'ios') {
    return (
      <div class="install-banner install-banner-ios">
        <button class="install-banner-close" onClick={handleDismiss} aria-label="Zamknij">
          ✕
        </button>
        <div class="install-banner-body">
          <span class="install-banner-icon">📱</span>
          <div class="install-banner-text">
            <strong>Dodaj do ekranu głównego</strong>
            <span>
              Kliknij <span class="install-banner-share-icon">⎙</span>{' '}
              <strong>Udostępnij</strong> na pasku Safari, potem{' '}
              <strong>„Do ekranu głównego"</strong>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
