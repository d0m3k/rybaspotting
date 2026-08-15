package config

import (
	"os"
	"strconv"
	"strings"
	"sync"
)

// Config holds all runtime configuration.
type Config struct {
	DatabaseURL        string
	JWTSecret          string
	ListenAddr         string
	PhotoDir           string
	NearbyRadiusMeters float64
	MaxPhotoWidth      int
	CaptchaAnswers     []string

	// Turnstile (Cloudflare). When Secret is non-empty, registration requires a
	// verified Turnstile token instead of the trivia captcha (which is trivially
	// bypassable by bots). SiteKey is public — exposed to the frontend via /api/config.
	TurnstileSiteKey string
	TurnstileSecret  string

	// MaxFishPerDay caps how many spots a single user can upload per rolling 24h,
	// to prevent a single bot account from running up R2 storage/Class-A bills.
	MaxFishPerDay int

	// MaxCommentsPerDay caps how many comments a single user can post per rolling
	// 24h. Default 1000 — generous for real human use, hard ceiling on spam.
	MaxCommentsPerDay int

	// MaxCommentLength caps the number of runes (Unicode code points) in a comment
	// body. Default 2000 — long enough for a paragraph, short enough to keep the
	// wall readable and the DB rows small.
	MaxCommentLength int

	// R2 / S3-compatible storage (optional — falls back to local disk if empty)
	R2Endpoint       string
	R2AccessKeyID    string
	R2SecretAccessKey string
	R2Bucket         string
	R2PublicURL      string

	// Pushover notifications (optional — disabled unless BOTH keys are set).
	// UserKey is your personal key from pushover.net; AppToken comes from an
	// application you create at pushover.net → Your Applications.
	PushoverUserKey  string
	PushoverAppToken string

	// PublicURL is the app's public origin, used as the tap-through link in
	// push notifications (e.g. https://ryby.dom3k.pl).
	PublicURL string

	mu                   sync.RWMutex
	allowGalleryUpload   bool
}

// Load reads configuration from environment variables.
func Load() *Config {
	cfg := &Config{
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/rybaspotting?sslmode=disable"),
		JWTSecret:          getEnv("JWT_SECRET", "change-me-secret"),
		ListenAddr:         getEnv("LISTEN_ADDR", "127.0.0.1:8080"),
		PhotoDir:           getEnv("PHOTO_DIR", "/var/lib/rybaspotting/photos"),
		NearbyRadiusMeters: getEnvFloat("NEARBY_RADIUS_METERS", 50),
		MaxPhotoWidth:      getEnvInt("MAX_PHOTO_WIDTH", 1200),
		CaptchaAnswers:     getEnvList("CAPTCHA_ANSWERS", []string{"dupom", "dupą", "dupa"}),
		allowGalleryUpload: getEnvBool("ALLOW_GALLERY_UPLOAD", false),

		// Turnstile is opt-in: set both keys in the environment (or .env) to enable.
		TurnstileSiteKey: getEnv("TURNSTILE_SITE_KEY", ""),
		TurnstileSecret:  getEnv("TURNSTILE_SECRET", ""),

		// Default 300 fish/user/day — generous for real use, hard cap on abuse.
		MaxFishPerDay: getEnvInt("MAX_FISH_PER_DAY", 300),

		// Default 1000 comments/user/day — generous for real use, hard cap on spam.
		MaxCommentsPerDay: getEnvInt("MAX_COMMENTS_PER_DAY", 1000),

		// Default 2000 runes/comment — paragraph-length, keeps the wall readable.
		MaxCommentLength: getEnvInt("MAX_COMMENT_LENGTH", 2000),

		// R2 / S3-compatible storage (all empty = use local disk)
		R2Endpoint:        getEnv("R2_ENDPOINT", ""),
		R2AccessKeyID:     getEnv("R2_ACCESS_KEY_ID", ""),
		R2SecretAccessKey: getEnv("R2_SECRET_ACCESS_KEY", ""),
		R2Bucket:          getEnv("R2_BUCKET", ""),
		R2PublicURL:       getEnv("R2_PUBLIC_URL", ""),

		// Pushover — opt-in: notifications only when both keys are configured.
		PushoverUserKey:  getEnv("PUSHOVER_USER_KEY", ""),
		PushoverAppToken: getEnv("PUSHOVER_APP_TOKEN", ""),

		// Public origin used inside notification links.
		PublicURL: getEnv("PUBLIC_URL", "https://ryby.dom3k.pl"),
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

func getEnvList(key string, fallback []string) []string {
	if v := os.Getenv(key); v != "" {
		parts := strings.Split(v, ",")
		result := make([]string, 0, len(parts))
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				result = append(result, strings.ToLower(p))
			}
		}
		if len(result) > 0 {
			return result
		}
	}
	return fallback
}
