import { render } from 'preact';
import { useRegisterSW } from 'virtual:pwa-register/preact';
import { App } from './App';
import './style.css';

function Root() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // SW registered — could log
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
