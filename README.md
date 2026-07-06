# 🐟 Ryby z Dupom — Spotter

A Progressive Web App for spotting and collecting "Ryby z dupom" graffiti around Kraków.

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Go + chi router + sqlx |
| **Frontend** | Preact + Vite + PWA plugin |
| **Database** | PostgreSQL (mikr.us shared hosting) |
| **Photos** | Cloudflare R2 (S3-compatible, free tier) → served via CDN |
| **Maps** | Leaflet (OpenStreetMap) |
| **Auth** | bcrypt + JWT (indefinite sessions) |
| **Deploy** | GitHub Actions → auto-update via cron every minute |

## Features

- 📸 **Spot on the spot** — live camera capture with auto-geolocation
- 📂 **Gallery upload** — with EXIF GPS extraction (togglable by admin)
- 🗺️ **Map view** — all fish shown on Leaflet map
- 🎣 **Collect** — join the list of people who found the same fish
- 🏆 **Leaderboard** — top spotters and top collectors
- 👤 **Profile** — your spots and collections with avatars
- 🔑 **Admin panel** — user management, fish/collection cleanup, stats
- ☁️ **Cloudflare R2** — photos stored in R2, served via CDN (zero VPS disk usage)
- 🔄 **Auto-deploy** — every push to master triggers GitHub Actions build + auto-update on VPS
- 💾 **Daily backups** — PostgreSQL dump + config (with R2 keys) → `strych.mikr.us`, 14-day retention

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Browser    │────▶│  Cloudflare  │────▶│  VPS (mikr.us)  │
│  (PWA app)   │     │  Tunnel + DNS│     │  Go backend :8080│
└──────────────┘     └──────┬───────┘     └────────┬────────┘
                            │                       │
                            │  cdn.ryby.dom3k.pl    │
                            ▼                       ▼
                     ┌──────────────┐     ┌─────────────────┐
                     │  Cloudflare  │     │   PostgreSQL    │
                     │  R2 (photos) │     │  (mikr.us host) │
                     └──────────────┘     └─────────────────┘
```

## Quick Start

### 1. Prerequisites

- Go 1.21+
- Node.js 18+
- PostgreSQL (local or remote)

### 2. Setup

```bash
cp .env.example .env
# Edit .env with your database credentials and secrets

# Build
./scripts/build.sh

# Run (backend)
cd backend && go run ./cmd/rybaspotting/

# Or run frontend dev server
cd frontend && npm run dev
```

### 3. Create an admin user

```bash
# Register via the app, then:
./scripts/create-admin.sh yourusername
```

## Photo Storage — Cloudflare R2

Photos are stored in Cloudflare R2 (S3-compatible object storage, free tier: 10 GB, unlimited egress). When R2 is configured, the backend uploads directly to R2 and the API returns full CDN URLs. If R2 vars are empty, photos fall back to local disk at `PHOTO_DIR`.

### R2 Environment Variables

```env
R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=rybaspotting-photos
R2_PUBLIC_URL=https://cdn.ryby.dom3k.pl
```

### Migrating existing photos to R2

```bash
# Install rclone, configure an "r2" remote, then:
R2_BUCKET=rybaspotting-photos \
PHOTO_DIR=/var/lib/rybaspotting/photos \
./scripts/migrate-photos-to-r2.sh

# Dry run first:
./scripts/migrate-photos-to-r2.sh --dry-run
```

## Deploy to VPS

Deployment is fully automated via GitHub Actions — every push to `master` builds the binary + frontend, creates a release, and the VPS picks it up within a minute via `auto-update.sh`.

Manual deploy if needed:

```bash
./scripts/deploy.sh root@amy135.mikrus.xyz 10135
```

## Backup

Daily at 3 AM via cron — backs up PostgreSQL dump + config (`.env` with R2 keys, nginx, systemd unit, crontab) to `strych.mikr.us`. 14-day retention. Photos are not backed up since R2 handles durability.

```bash
# Force a backup:
ssh amy '/opt/rybaspotting/backup.sh'

# Retrieve latest backup to local machine:
ssh amy 'ssh -i /backup_key amy135@strych.mikr.us "cat backups/$(ssh -i /backup_key amy135@strych.mikr.us ls -t backups/ | head -1)"'
```

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login, returns JWT |
| GET | `/api/config` | No | Public config (upload toggle) |
| GET | `/api/fish` | No | List fish (paginated, includes `photo_url`) |
| GET | `/api/fish/{id}` | No | Fish detail with collectors |
| GET | `/api/fish/nearby?lat=&lng=&radius_m=` | No | Nearby fish |
| GET | `/api/photos/{filename}` | No | Redirects to R2 CDN (or serves locally) |
| GET | `/api/leaderboard` | No | Leaderboard |
| GET | `/api/users/avatar/{userID}` | No | User avatar (redirects to R2) |
| POST | `/api/fish` | Yes | Create new spotting |
| DELETE | `/api/fish/{id}` | Yes | Delete own spot |
| POST | `/api/fish/{id}/collect` | Yes | Collect a fish |
| DELETE | `/api/fish/{id}/collect` | Yes | Uncollect |
| GET | `/api/users/me` | Yes | Current user stats |
| POST | `/api/users/me/avatar` | Yes | Upload avatar |
| PUT | `/api/users/me/display-name` | Yes | Update display name |
| POST | `/api/admin/toggle-upload-mode` | Admin | Toggle gallery upload |
| GET | `/api/admin/stats` | Admin | Dashboard stats |
| GET | `/api/admin/users` | Admin | List users |
| GET | `/api/admin/fish` | Admin | List all fish |
| DELETE | `/api/admin/fish/{id}` | Admin | Delete fish |
| POST | `/api/admin/promote` | Admin | Promote user to admin |
| POST | `/api/admin/set-password` | Admin | Reset user password |
| POST | `/api/admin/delete-user` | Admin | Delete/soft-delete user |
| POST | `/api/admin/restore-user` | Admin | Restore soft-deleted user |

## Environment Variables (`.env`)

See `.env.example` for all options. Key variables:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Secret for signing JWT tokens
- `ADMIN_TOKEN` — Token for admin API endpoints
- `R2_ENDPOINT` — Cloudflare R2 endpoint (leave empty for local disk storage)
- `R2_ACCESS_KEY_ID` — R2 API token access key
- `R2_SECRET_ACCESS_KEY` — R2 API token secret
- `R2_BUCKET` — R2 bucket name
- `R2_PUBLIC_URL` — Public CDN URL for photos (e.g. `https://cdn.ryby.dom3k.pl`)
- `ALLOW_GALLERY_UPLOAD` — Set to `true` to enable gallery photo uploads
- `NEARBY_RADIUS_METERS` — Radius for matching fish (default: 50m)
- `MAX_PHOTO_WIDTH` — Max photo width in pixels (default: 1200)
