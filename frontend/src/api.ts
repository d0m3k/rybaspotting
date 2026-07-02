const BASE = '';

interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    ...opts.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Unknown error');
  }

  return res.json();
}

export const api = {
  // Auth
  register: (username: string, password: string, displayName: string) =>
    request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, display_name: displayName }),
    }),

  login: (username: string, password: string) =>
    request<{ token: string; user_id: number; username: string; display_name: string; is_active: boolean; is_admin: boolean }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) }
    ),

  // Config
  getConfig: () =>
    request<{ allow_gallery_upload: boolean }>('/api/config'),

  // Fish
  listFish: (page = 1, limit = 50) =>
    request<any[]>(`/api/fish?page=${page}&limit=${limit}`),

  getFish: (id: number) =>
    request<any>(`/api/fish/${id}`),

  nearbyFish: (lat: number, lng: number, radiusM = 30) =>
    request<any[]>(`/api/fish/nearby?lat=${lat}&lng=${lng}&radius_m=${radiusM}`),

  createFish: (formData: FormData, liveCapture = false) =>
    request('/api/fish', {
      method: 'POST',
      body: formData,
      headers: liveCapture ? { 'X-Live-Capture': 'true' } : {},
    }),

  // Collect
  collect: (fishId: number) =>
    request(`/api/fish/${fishId}/collect`, { method: 'POST' }),

  uncollect: (fishId: number) =>
    request(`/api/fish/${fishId}/collect`, { method: 'DELETE' }),

  // Leaderboard
  leaderboard: () =>
    request<{ top_spotters: { username: string; count: number }[]; top_collectors: { username: string; count: number }[] }>(
      '/api/leaderboard'
    ),
};
