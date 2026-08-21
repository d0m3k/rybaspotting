// Tiny hash-based router (same pattern as rozszerzify: `location.hash`
// split on "/", synced via the `hashchange` event).
//
// Routes:
//   #/login | #/register | #/privacy        — public screens
//   #/map                                   — map
//   #/spot | #/upload | #/leaderboard
//   #/wall | #/profile | #/admin            — app screens
//   #/fish/{id}                             — map focused on one fish
//
// Using the hash (instead of history.pushState) means shared fish links work
// straight from a static PWA without nginx rewrites, and deep links survive
// service-worker navigation.

export type Page = 'login' | 'register' | 'map' | 'spot' | 'upload' | 'leaderboard' | 'wall' | 'profile' | 'admin' | 'privacy';

export interface Route {
  page: Page;
  fishId?: number;
}

const PAGE_PATH: Record<Page, string> = {
  login: '/login',
  register: '/register',
  map: '/map',
  spot: '/spot',
  upload: '/upload',
  leaderboard: '/leaderboard',
  wall: '/wall',
  profile: '/profile',
  admin: '/admin',
  privacy: '/privacy',
};

/** Parse the current location.hash into a route. Unknown/empty → map. */
export function parseHash(): Route {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [first, second] = parts;
  switch (first) {
    case 'login': return { page: 'login' };
    case 'register': return { page: 'register' };
    case 'privacy': return { page: 'privacy' };
    case 'spot': return { page: 'spot' };
    case 'upload': return { page: 'upload' };
    case 'leaderboard': return { page: 'leaderboard' };
    case 'wall': return { page: 'wall' };
    case 'profile': return { page: 'profile' };
    case 'admin': return { page: 'admin' };
    case 'fish': {
      const id = Number(second);
      if (!Number.isInteger(id) || id <= 0) return { page: 'map' };
      return { page: 'map', fishId: id };
    }
    default:
      return { page: 'map' };
  }
}

export function hashFor(r: Route): string {
  if (r.page === 'map' && r.fishId != null) return `#/fish/${r.fishId}`;
  return `#${PAGE_PATH[r.page]}`;
}

/** Update the URL hash (no-op when already there, to avoid hashchange loops). */
export function navigate(route: Route): void {
  const target = hashFor(route);
  if (location.hash !== target) location.hash = target;
}

/** Fully-qualified, shareable URL for a fish. */
export function fishUrl(id: number): string {
  return `${location.origin}${location.pathname}#/fish/${id}`;
}

/** Subscribe to hash changes. Returns an unsubscribe function. */
export function onHashChange(cb: (r: Route) => void): () => void {
  const handler = () => cb(parseHash());
  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}