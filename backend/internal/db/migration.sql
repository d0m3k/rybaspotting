-- Rybaspotting database schema
-- Idempotent: CREATE TABLE IF NOT EXISTS
-- Note: cube + earthdistance extensions not available on Mikrus PostgreSQL
-- Using Haversine formula in Go/HCL instead for nearby queries

CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL DEFAULT '',
    is_admin    BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fish (
    id              SERIAL PRIMARY KEY,
    photo_filename  VARCHAR(255) NOT NULL,
    latitude        DECIMAL(9,6) NOT NULL,
    longitude       DECIMAL(9,6) NOT NULL,
    address_hint    TEXT NOT NULL DEFAULT '',
    spotted_by      INTEGER NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fish_location ON fish (latitude, longitude);

CREATE TABLE IF NOT EXISTS collections (
    id          SERIAL PRIMARY KEY,
    fish_id     INTEGER NOT NULL REFERENCES fish(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(fish_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collections_fish ON collections (fish_id);
CREATE INDEX IF NOT EXISTS idx_collections_user ON collections (user_id);
