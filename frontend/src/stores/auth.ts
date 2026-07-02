// Simple auth store backed by localStorage

export interface AuthState {
  token: string;
  userId: number;
  username: string;
  displayName: string;
  isActive: boolean;
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
