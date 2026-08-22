// Simple auth store backed by localStorage

import { navigate } from '../router';

export interface AuthState {
  token: string;
  userId: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
}

const AUTH_KEY = 'rybaspotting_auth';

export function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveAuth(state: AuthState) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(state));
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem('token');
}

export function getToken(): string | null {
  const auth = loadAuth();
  return auth?.token || null;
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}

const LOGIN_RETURN_KEY = 'rybaspotting_return';

/** Go to the login screen, remembering the current view so a successful
 *  login can drop the user back where they were (e.g. a shared #/fish/{id}). */
export function goToLogin(): void {
  try {
    sessionStorage.setItem(LOGIN_RETURN_KEY, location.hash);
  } catch { /* private mode — return-to just won't work */ }
  navigate({ page: 'login' });
}

/** After a successful login, return the remembered view hash (if any).
 *  Consumes the stored value — one return per login. */
export function consumeLoginReturn(): string | null {
  try {
    const ret = sessionStorage.getItem(LOGIN_RETURN_KEY);
    if (ret) sessionStorage.removeItem(LOGIN_RETURN_KEY);
    return ret;
  } catch {
    return null;
  }
}
