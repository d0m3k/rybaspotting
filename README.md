# 🐟 Ryby z Dupom — Spotter

A Progressive Web App for spotting and collecting "Ryby z dupom" graffiti around Kraków.

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Go + chi router + sqlx |
| **Frontend** | Preact + Vite + PWA plugin |
| **Database** | PostgreSQL (with cube/earthdistance) |
| **Maps** | Leaflet (OpenStreetMap) |
| **Auth** | bcrypt + JWT (indefinite sessions) |
| **Photos** | Server-side downscale via `imaging` |

## Features

- 📸 **Spot on the spot** — live camera capture with auto-geolocation
- 📂 **Gallery upload** — with EXIF GPS extraction (togglable by admin)
- 🗺️ **Map view** — all fish shown on Leaflet map
- 🎣 **Collect** — join the list of people who found the same fish
- 🏆 **Leaderboard** — top spotters and top collectors
- 👤 **Profile** — your spots and collections
- ✅ **Admin approval** — new accounts must be approved before use
- 🔒 **Photo downscaling** — saves disk space (1200px max width)

## Quick Start

### 1. Prerequisites

- Go 1.21+
- Node.js 18+
- PostgreSQL with `cube` and `earthdistance` extensions

### 2. Setup

```bash
cp .env.example .env
# Edit .env with your database credentials and secrets

# Build
./scripts/build.sh

# Run (backend)
cd backend && ../go/bin/go run ./cmd/rybaspotting/

# Or run frontend dev server
cd frontend && npm run dev
```

### 3. Create an admin user

```bash
# Register via the app, then:
./scripts/create-admin.sh yourusername
```

### 4. Approve other users

```bash
export ADMIN_TOKEN="your-admin-token-from-env"
./scripts/approve-user.sh newusername
```

## Deploy to VPS

```bash
./scripts/deploy.sh root@amy135.mikrus.xyz 10135
```

Then configure nginx with `deploy/nginx.conf` and enable the systemd service.

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login, returns JWT |
| GET | `/api/config` | No | Public config (upload toggle) |
| GET | `/api/fish` | No | List fish (paginated) |
| GET | `/api/fish/{id}` | No | Fish detail with collectors |
| GET | `/api/fish/nearby?lat=&lng=&radius_m=` | No | Nearby fish |
| GET | `/api/photos/{filename}` | No | Serve photo |
| GET | `/api/leaderboard` | No | Leaderboard |
| POST | `/api/fish` | Yes | Create new spotting |
| POST | `/api/fish/{id}/collect` | Yes | Collect a fish |
| DELETE | `/api/fish/{id}/collect` | Yes | Uncollect |
| POST | `/api/admin/approve-user` | Admin | Approve user |
| POST | `/api/admin/toggle-upload-mode` | Admin | Toggle gallery upload |

## Environment Variables (`.env`)

See `.env.example` for all options. Key variables:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Secret for signing JWT tokens
- `ADMIN_TOKEN` — Token for admin API endpoints
- `ALLOW_GALLERY_UPLOAD` — Set to `true` to enable gallery photo uploads
- `NEARBY_RADIUS_METERS` — Radius for matching fish (default: 30m)
- `MAX_PHOTO_WIDTH` — Max photo width in pixels (default: 1200)
