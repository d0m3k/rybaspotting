import { render } from 'preact';
import { useRegisterSW } from 'virtual:pwa-register/preact';
import { App } from './App';
import './style.css';

// Track whether we already had an active SW (to avoid reload on first install)
let hadController = !!navigator.serviceWorker?.controller;

function Root() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(swReg) {
      // Listen for controller changes — new SW with skipWaiting took over
      navigator.serviceWorker?.addEventListener('controllerchange', () => {
        // Only reload if there was a previous SW (not first install)
        if (hadController) {
          window.location.reload();
        }
        hadController = true;
      });

      // Also show update prompt if there's already a waiting worker
      if (swReg?.waiting) {
        setNeedRefresh(true);
      }

      // Detect newly installed workers (fallback for browsers that don't skipWaiting fast enough)
      swReg?.addEventListener('updatefound', () => {
        const newWorker = swReg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setNeedRefresh(true);
            }
          });
        }
      });
    },
    onRegisterError(error) {
      console.warn('SW registration failed:', error);
    },
  });

  function handleRefresh() {
    updateServiceWorker(true);
  }

  return (
    <>
      <App />
      {needRefresh && (
        <div class="update-toast">
          <div class="update-toast-inner">
            <span>✨ Nowa wersja dostępna!</span>
            <button class="update-toast-btn" onClick={handleRefresh}>
              Odśwież
            </button>
          </div>
        </div>
      )}
    </>
  );
}

render(<Root />, document.getElementById('app')!);
