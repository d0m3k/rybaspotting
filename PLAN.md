# 🐟 Ryby z Dupom — Spotter PWA

## Overview

A Progressive Web App to spot and collect "Ryby z dupom" graffiti around Kraków.  
Runs on a **mikr.us VPS** (1 GB RAM, 10 GB disk) with nginx + cloudflared already in place.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Backend** | Go 1.21+ (`chi` router, `sqlx` for DB) | Single static binary ~10 MB, near-zero idle RAM, fast compilation |
| **Frontend** | Preact + Vite + PWA plugin | Tiny bundle (~5 KB gzipped), mobile-first, full PWA out of the box |
| **Database** | PostgreSQL (available on mikr.us) | Robust, spatial queries via `earthdistance` / `cube` extensions |
| **Maps** | Leaflet (free, no API key) | Lightweight, OpenStreetMap tiles |
| **EXIF** | `exifr` (browser-side) | Extract GPS from gallery photos |
| **Photo processing** | Go's `github.com/disintegration/imaging` | Server-side resize + thumbnail generation |
| **Auth** | bcrypt + JWT (no expiry claim) | Stateless, indefinite sessions stored in localStorage |
| **Deployment** | Binary served via systemd, nginx reverse-proxy | Already have nginx + cloudflared, no Docker needed |

## Infrastructure (existing on mikr.us)

- `cloudflared` → nginx (port 80/443) → app (port `:8080`)
- PostgreSQL is available
- So the app just needs to be a **Go binary + systemd unit**, no Docker required
- Photo storage: `/var/lib/rybaspotting/photos/` (outside the binary)

## Environment Config (`.env` — gitignored)

```env
DATABASE_URL=postgres://user:pass@localhost:5432/rybaspotting
JWT_SECRET=<random-64-char-hex>
ADMIN_TOKEN=<random-64-char-hex>
LISTEN_ADDR=127.0.0.1:8080
PHOTO_DIR=/var/lib/rybaspotting/photos
ALLOW_GALLERY_UPLOAD=false
NEARBY_RADIUS_METERS=30
MAX_PHOTO_WIDTH=1200
```

---

## Implementation Phases

### 1. Scaffold, DB schema & migrations

   - Initialize Go module (`backend/`) and Preact+Vite project (`frontend/`).
   - Create `.env.example`, add `.env` to `.gitignore`.
   - Write SQL migration (idempotent, `CREATE TABLE IF NOT EXISTS`) for:
     - `users` — `id SERIAL PK`, `username VARCHAR UNIQUE`, `password_hash VARCHAR`, `display_name VARCHAR`, `is_active BOOLEAN DEFAULT false`, `is_admin BOOLEAN DEFAULT false`, `created_at TIMESTAMP`
     - `fish` — `id SERIAL PK`, `photo_filename VARCHAR`, `latitude DECIMAL(9,6)`, `longitude DECIMAL(9,6)`, `address_hint TEXT`, `spotted_by INT FK → users`, `created_at TIMESTAMP`
     - `collections` — `id SERIAL PK`, `fish_id INT FK → fish`, `user_id INT FK → users`, `created_at TIMESTAMP`, `UNIQUE(fish_id, user_id)`
   - Enable PostgreSQL extensions: `cube`, `earthdistance` for spatial nearby queries.
   - Migration runs automatically on app startup (embedded SQL + `sqlx.MustExec`).
   - Create helper script `scripts/approve-user.sh` and `scripts/create-admin.sh`.

### 2. Auth & admin endpoints

   - `POST /api/auth/register` — bcrypt hash, insert with `is_active=false`, return "awaiting approval".
   - `POST /api/auth/login` — bcrypt verify, sign JWT **without expiry** (`exp` claim omitted), reject inactive users.
   - Middleware: `AuthMiddleware` (extract + validate JWT from `Authorization: Bearer <token>`), inject `userID` + `isActive` + `isAdmin` into context.
   - `POST /api/admin/approve-user` — guarded by `X-Admin-Token` header (match against `ADMIN_TOKEN` env var). Sets `is_active=true`.
   - `POST /api/admin/toggle-upload-mode` — flips `ALLOW_GALLERY_UPLOAD` in a runtime in-memory toggle (does not rewrite `.env`; env is the boot default, runtime is the live value).
   - `GET /api/config` — returns `{ allowGalleryUpload: true/false }` so the frontend knows which UI to show.

### 3. Core fish spotting & nearby query

   - `POST /api/fish` **(auth + active required)**:
     - Accepts multipart form: `photo` (file), `latitude`, `longitude`, optional `address_hint`.
     - If `ALLOW_GALLERY_UPLOAD=false` **and** request does NOT carry a `X-Live-Capture: true` header (set by the JS capture API), reject with 403.
     - Downscale photo to `MAX_PHOTO_WIDTH` (e.g. 1200px) using `imaging.Resize`, save to `PHOTO_DIR/<fish_id>.jpg`.
     - Also generate a 200px thumbnail: `PHOTO_DIR/<fish_id>_thumb.jpg`.
     - Insert fish row, return the created fish.
   - `GET /api/fish` — paginated list (id, thumbnail URL, lat, lng, spotter name, created_at).
   - `GET /api/fish/{id}` — detail with photo URL + list of collectors (username + timestamp).
   - `GET /api/fish/nearby?lat=&lng=&radius_m=` — returns fish within radius using `earthdistance` SQL. Used by the frontend to ask "is this existing?"
   - `GET /api/photos/{filename}` — serves static photos (nginx should also be configured to serve `PHOTO_DIR` directly for performance).

### 4. Collecting

   - `POST /api/fish/{id}/collect` **(auth + active required)** — inserts into `collections`. Returns 409 if already collected.
   - `DELETE /api/fish/{id}/collect` **(auth)** — removes your collection (optional, nice to have).

### 5. Leaderboard

   - `GET /api/leaderboard` — returns two sorted arrays:
     - `topSpotters`: `SELECT u.username, COUNT(f.id) AS count FROM users u JOIN fish f ON f.spotted_by = u.id GROUP BY u.id ORDER BY count DESC LIMIT 50`
     - `topCollectors`: `SELECT u.username, COUNT(c.id) AS count FROM users u JOIN collections c ON c.user_id = u.id GROUP BY u.id ORDER BY count DESC LIMIT 50`

### 6. Frontend — Preact PWA

   - **App shell**: service worker (via `vite-plugin-pwa`), `manifest.json`, offline-capable shell.
   - **Routing**: `preact-router` or simple hash-based router. Pages:
     - `/login` — login form, on success store JWT in `localStorage`.
     - `/register` — register form, shows "awaiting approval" on success.
     - `/` — **Map view**: full-screen Leaflet map with markers for all fish. Tapping a marker opens a bottom sheet with photo, spotter, "Collect" button.
     - `/spot` — **Spot on the spot**: 
       1. Get geolocation (`navigator.geolocation.getCurrentPosition`).
       2. Camera capture (`navigator.mediaDevices.getUserMedia` or `<input capture="environment" accept="image/*">`).
       3. On photo taken, immediately query `GET /api/fish/nearby` with the location.
       4. If nearby fish found → show modal: "Is this the same ryba?" with photo thumbnails. User can pick one to **collect** instead.
       5. If none match or user says "No, it's new" → upload as new spotting.
     - `/upload` — **Gallery upload (only if `allowGalleryUpload=true`)**: 
       1. Pick photo from gallery.
       2. Client-side EXIF extraction (`exifr`) for GPS coordinates.
       3. Show map with auto-placed marker, user can drag to correct.
       4. Same nearby-check flow as `/spot`.
     - `/leaderboard` — two tables: top spotters, top collectors.
     - `/profile` — list of user's spots + collections.
   - **UX notes**:
     - All write actions (spot, collect) show a loading spinner.
     - Navigation bar at bottom with icons: Map, Spot, Leaderboard, Profile.
     - If `allowGalleryUpload=false`, the upload tab is hidden entirely.

### 7. Deploy & admin scripts

   - `scripts/approve-user.sh` — `curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" ...` to approve a username.
   - `scripts/create-admin.sh` — direct SQL via `psql` to insert an admin user with a known password hash (run after registration, then approve + set admin flag via SQL).
   - `deploy/rybaspotting.service` — systemd unit file.
   - `deploy/nginx.conf` — nginx location blocks (proxy_pass to `127.0.0.1:8080`, serve `/photos/` directly).
   - Build script: `scripts/build.sh` — `cd backend && go build -o ../dist/rybaspotting . && cd ../frontend && npm run build`.
   - Deploy script: `scripts/deploy.sh` — rsync binary + frontend dist, restart service.

---

## File Structure (final)

```
rybaspotting/
├── .env.example
├── .env                  # gitignored
├── .gitignore
├── PLAN.md
├── README.md
├── backend/
│   ├── main.go
│   ├── go.mod / go.sum
│   ├── db/
│   │   ├── migration.sql
│   │   └── db.go
│   ├── handlers/
│   │   ├── auth.go
│   │   ├── admin.go
│   │   ├── fish.go
│   │   ├── collect.go
│   │   └── leaderboard.go
│   ├── middleware/
│   │   └── auth.go
│   ├── models/
│   │   ├── user.go
│   │   ├── fish.go
│   │   └── collection.go
│   └── config/
│       └── config.go
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   ├── stores/auth.ts
│   │   ├── components/
│   │   └── pages/
│   └── public/
├── scripts/
│   ├── approve-user.sh
│   ├── create-admin.sh
│   ├── build.sh
│   └── deploy.sh
└── deploy/
    ├── rybaspotting.service
    └── nginx.conf
```

## Disk Budget (est.)

| Item | Size |
|---|---|
| Go binary | ~15 MB |
| Frontend static | ~500 KB |
| Photos (1000 fish × 200 KB avg) | ~200 MB |
| PostgreSQL | ~50 MB |
| **Total** | **~265 MB** — well within 10 GB |
