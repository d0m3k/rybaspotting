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
  register: (username: string, password: string, displayName: string, captcha: string) =>
    request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, display_name: displayName, captcha }),
    }),

  login: (username: string, password: string) =>
    request<{ token: string; user_id: number; username: string; display_name: string; is_admin: boolean }>(
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

  // User stats
  getMyStats: () =>
    request<{
      user_id: number;
      username: string;
      display_name: string;
      is_admin: boolean;
      spotted: number;
      collected: number;
    }>('/api/users/me'),

  getMyCollections: () =>
    request<any[]>('/api/users/me/collections'),

  // Admin (protected by JWT — only users with is_admin=true)
  getAdminStats: () =>
    request<{
      user_count: number;
      fish_count: number;
      photo_count: number;
      photo_size_mb: number;
    }>('/api/admin/stats'),

  promoteUser: (username: string) =>
    request(`/api/admin/promote?username=${encodeURIComponent(username)}`, {
      method: 'POST',
    }),

  // Admin — list all fish
  listAllFish: () =>
    request<any[]>('/api/admin/fish'),

  // Admin — delete a fish (hard delete)
  deleteFish: (id: number) =>
    request(`/api/admin/fish/${id}`, { method: 'DELETE' }),

  // Leaderboard
  leaderboard: () =>
    request<{ top_spotters: { username: string; count: number }[]; top_collectors: { username: string; count: number }[] }>(
      '/api/leaderboard'
    ),
};
