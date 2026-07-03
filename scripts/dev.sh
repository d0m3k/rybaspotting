#!/bin/bash
# Rybaspotting — Local dev environment launcher
# Usage:  ./scripts/dev.sh [up|down|build|restart|logs|sql]
#
# This uses podman directly (no docker-compose needed).
# Frontend runs separately: cd frontend && npm run dev

set -euo pipefail
cd "$(dirname "$0")/.."

NETWORK="rybaspotting-net"
DB_VOLUME="rybaspotting-pgdata"
PHOTOS_VOLUME="rybaspotting-photos"
DB_NAME="rybaspotting-db"
BACKEND_NAME="rybaspotting-backend"

case "${1:-up}" in
  up)
    echo "=== Creating network (if needed) ==="
    podman network create "$NETWORK" 2>/dev/null || true

    echo "=== Starting PostgreSQL ==="
    podman run --replace -d \
      --name "$DB_NAME" \
      --network "$NETWORK" \
      -e POSTGRES_USER=rybaspotting \
      -e POSTGRES_PASSWORD=rybaspotting \
      -e POSTGRES_DB=rybaspotting \
      -p 5432:5432 \
      -v "$DB_VOLUME:/var/lib/postgresql/data" \
      --health-cmd "pg_isready -U rybaspotting" \
      --health-interval 3s \
      --health-timeout 3s \
      --health-retries 10 \
      docker.io/postgres:16-alpine
    echo "  Waiting for PostgreSQL to be healthy..."
    until podman healthcheck run "$DB_NAME" 2>/dev/null; do
      sleep 1
    done
    echo "  PostgreSQL ready!"

    echo "=== Building backend image ==="
    podman build -t rybaspotting-backend -f backend/Dockerfile .

    echo "=== Starting backend ==="
    podman run --replace -d \
      --name "$BACKEND_NAME" \
      --network "$NETWORK" \
      -e DATABASE_URL="postgres://rybaspotting:rybaspotting@${DB_NAME}:5432/rybaspotting?sslmode=disable" \
      -e JWT_SECRET="dev-secret-change-me-in-prod" \
      -e LISTEN_ADDR="0.0.0.0:8080" \
      -e PHOTO_DIR="/data/photos" \
      -e ALLOW_GALLERY_UPLOAD="true" \
      -p 8080:8080 \
      -v "$PHOTOS_VOLUME:/data/photos" \
      rybaspotting-backend

    echo ""
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║  🐟 Rybaspotting dev environment is UP!             ║"
    echo "║                                                     ║"
    echo "║  Backend API:     http://localhost:8080              ║"
    echo "║  PostgreSQL:      localhost:5432                     ║"
    echo "║                                                     ║"
    echo "║  To start frontend (HMR):                           ║"
    echo "║    cd frontend && npm run dev                       ║"
    echo "║    → http://localhost:5173                           ║"
    echo "║                                                     ║"
    echo "║  Test accounts (auto-seeded on fresh DB):           ║"
    echo "║    admin  / admin123  (admin)                       ║"
    echo "║    demo   / demo123   (regular user)                ║"
    echo "║    rybka  / rybka123  (regular user)                ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    ;;

  down)
    echo "=== Stopping containers ==="
    podman stop "$BACKEND_NAME" 2>/dev/null || true
    podman stop "$DB_NAME" 2>/dev/null || true
    podman rm "$BACKEND_NAME" 2>/dev/null || true
    podman rm "$DB_NAME" 2>/dev/null || true
    echo "Done. Data volumes persist (use: $0 wipe to reset DB)"
    ;;

  wipe)
    echo "=== Wiping all data ==="
    podman stop "$BACKEND_NAME" "$DB_NAME" 2>/dev/null || true
    podman rm "$BACKEND_NAME" "$DB_NAME" 2>/dev/null || true
    podman volume rm "$DB_VOLUME" "$PHOTOS_VOLUME" 2>/dev/null || true
    echo "All data wiped. Next 'up' will re-seed."
    ;;

  build)
    echo "=== Building backend image ==="
    podman build -t rybaspotting-backend -f backend/Dockerfile .
    echo "Build complete!"
    ;;

  restart)
    echo "=== Recreating backend with latest image ==="
    podman rm -f "$BACKEND_NAME" 2>/dev/null || true
    podman run --replace -d \
      --name "$BACKEND_NAME" \
      --network "$NETWORK" \
      -e DATABASE_URL="postgres://rybaspotting:rybaspotting@${DB_NAME}:5432/rybaspotting?sslmode=disable" \
      -e JWT_SECRET="dev-secret-change-me-in-prod" \
      -e LISTEN_ADDR="0.0.0.0:8080" \
      -e PHOTO_DIR="/data/photos" \
      -e ALLOW_GALLERY_UPLOAD="true" \
      -p 8080:8080 \
      -v "$PHOTOS_VOLUME:/data/photos" \
      rybaspotting-backend
    echo "Backend restarted with latest image."
    ;;

  logs)
    echo "=== Backend logs (Ctrl+C to exit) ==="
    podman logs -f "$BACKEND_NAME"
    ;;

  sql)
    echo "=== PostgreSQL shell ==="
    podman exec -it "$DB_NAME" psql -U rybaspotting
    ;;

  *)
    echo "Usage: $0 [up|down|wipe|build|restart|logs|sql]"
    echo ""
    echo "  up       — Start PostgreSQL + backend"
    echo "  down     — Stop containers (data preserved)"
    echo "  wipe     — Stop + delete volumes (fresh start)"
    echo "  build    — Rebuild backend image"
    echo "  restart  — Restart backend container"
    echo "  logs     — Tail backend logs"
    echo "  sql      — Open psql shell"
    exit 1
    ;;
esac
