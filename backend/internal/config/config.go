package config

import (
	"os"
	"strconv"
	"sync"
)

// Config holds all runtime configuration.
type Config struct {
	DatabaseURL        string
	JWTSecret          string
	AdminToken         string
	ListenAddr         string
	PhotoDir           string
	NearbyRadiusMeters float64
	MaxPhotoWidth      int

	mu                   sync.RWMutex
	allowGalleryUpload   bool
}

// Load reads configuration from environment variables.
func Load() *Config {
	cfg := &Config{
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/rybaspotting?sslmode=disable"),
		JWTSecret:          getEnv("JWT_SECRET", "change-me-secret"),
		AdminToken:         getEnv("ADMIN_TOKEN", "change-me-admin"),
		ListenAddr:         getEnv("LISTEN_ADDR", "127.0.0.1:8080"),
		PhotoDir:           getEnv("PHOTO_DIR", "/var/lib/rybaspotting/photos"),
		NearbyRadiusMeters: getEnvFloat("NEARBY_RADIUS_METERS", 30),
		MaxPhotoWidth:      getEnvInt("MAX_PHOTO_WIDTH", 1200),
		allowGalleryUpload: getEnvBool("ALLOW_GALLERY_UPLOAD", false),
	}
	return cfg
}

// AllowGalleryUpload returns the current toggle value (goroutine-safe).
func (c *Config) AllowGalleryUpload() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.allowGalleryUpload
}

// SetAllowGalleryUpload updates the toggle at runtime (goroutine-safe).
func (c *Config) SetAllowGalleryUpload(v bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.allowGalleryUpload = v
}

// --- helpers ---

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvFloat(key string, fallback float64) float64 {
	if v := os.Getenv(key); v != "" {
		f, err := strconv.ParseFloat(v, 64)
		if err == nil {
			return f
		}
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil {
			return n
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		b, err := strconv.ParseBool(v)
		if err == nil {
			return b
		}
	}
	return fallback
}
