import { useState, useEffect } from 'preact/hooks';

const DISMISS_KEY = 'rybaspotting_privacy_dismissed';

export function PrivacyBanner({ onOpenPolicy }: { onOpenPolicy: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(DISMISS_KEY)) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div class="privacy-banner">
      <div class="privacy-banner-text">
        🍪 Ta aplikacja przechowuje dane logowania (token sesji) w przeglądarce
        oraz zapisuje dane Twojego konta (nazwa użytkownika, spotted ryby,
        kolekcje). Nie używamy trackerów ani reklam. Więcej informacji znajdziesz
        w{' '}
        <span class="privacy-banner-link" onClick={onOpenPolicy}>
          Polityce Prywatności
        </span>.
      </div>
      <button class="privacy-banner-ok" onClick={dismiss}>
        OK
      </button>
    </div>
  );
}
