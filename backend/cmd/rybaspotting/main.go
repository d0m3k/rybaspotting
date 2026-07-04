package main

import (
	"bytes"
	"database/sql"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"rybaspotting/internal/config"
	"rybaspotting/internal/db"
	"rybaspotting/internal/handlers"
	"rybaspotting/internal/middleware"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	seedFlag := flag.Bool("seed", false, "seed the database with test data and start server")
	flag.Parse()

	// Load .env file if it exists
	_ = godotenv.Load()

	cfg := config.Load()

	// Override from environment (for actual deployment)
	if v := os.Getenv("DATABASE_URL"); v != "" {
		cfg.DatabaseURL = v
	}
	// ... other overrides are handled by config.Load() already

	// Connect to database
	conn, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer conn.Close()

	// Auto-seed if flag is set or DB is empty
	if *seedFlag || dbIsEmpty(conn) {
		if err := seedDevData(conn, cfg); err != nil {
			log.Printf("seed: %v (continuing anyway)", err)
		} else {
			log.Println("seed data ready")
		}
	}

	// Initialize handlers
	authH := &handlers.AuthHandler{DB: conn, Cfg: cfg}
	adminH := &handlers.AdminHandler{DB: conn, Cfg: cfg}
	fishH := &handlers.FishHandler{DB: conn, Cfg: cfg}
	collectH := &handlers.CollectHandler{DB: conn}
	leaderboardH := &handlers.LeaderboardHandler{DB: conn}
	userH := &handlers.UserHandler{DB: conn, Cfg: cfg}

	// Build router
	r := chi.NewRouter()

	// Middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RealIP)
	r.Use(corsMiddleware)
	r.Use(noCacheMiddleware)

	// Public endpoints
	r.Route("/api", func(r chi.Router) {
		// Auth
		r.Post("/auth/register", authH.Register)
		r.Post("/auth/login", authH.Login)

		// Public config
		r.Get("/config", fishH.Config)

		// Leaderboard
		r.Get("/leaderboard", leaderboardH.Get)

		// Fish - read endpoints are public
		r.Get("/fish", fishH.List)
		r.Get("/fish/{id}", fishH.Get)
		r.Get("/fish/nearby", fishH.Nearby)

		// Photo serving
		r.Get("/photos/{filename}", fishH.ServePhoto)

		// Avatar serving (public, by user ID)
		r.Get("/users/avatar/{userID}", userH.ServeAvatar)

		// Auth-protected endpoints
		r.Group(func(r chi.Router) {
			r.Use(middleware.AuthMiddleware(cfg))

			r.Post("/fish", fishH.Create)
			r.Delete("/fish/{id}", fishH.DeleteMyFish)
			r.Post("/fish/{id}/collect", collectH.Collect)
			r.Delete("/fish/{id}/collect", collectH.Uncollect)

			// User stats
			r.Get("/users/me", userH.Me)
			r.Get("/users/me/collections", userH.MyCollections)
			r.Post("/users/me/avatar", userH.UploadAvatar)
			r.Put("/users/me/display-name", userH.UpdateDisplayName)

			// Admin-only endpoints
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireAdmin)

				r.Post("/admin/promote", adminH.PromoteUser)
				r.Post("/admin/demote", adminH.DemoteUser)
				r.Post("/admin/toggle-upload-mode", adminH.ToggleGalleryUpload)
				r.Get("/admin/stats", adminH.Stats)
				r.Get("/admin/fish", adminH.ListAllFish)
				r.Delete("/admin/fish/{id}", adminH.DeleteFish)
				r.Get("/admin/collections", adminH.ListCollections)
				r.Delete("/admin/collections/{id}", adminH.DeleteCollection)
			})
		})
	})

	// Start server
	log.Printf("listening on %s", cfg.ListenAddr)
	if err := http.ListenAndServe(cfg.ListenAddr, r); err != nil {
		log.Fatalf("server: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Live-Capture")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// noCacheMiddleware prevents browsers and service workers from caching API responses.
func noCacheMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// no-cache = always validate; ETag/304 works. No must-revalidate/no-store.
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Pragma", "no-cache")
		next.ServeHTTP(w, r)
	})
}

// dbIsEmpty returns true if the database has no users (fresh database).
func dbIsEmpty(db *sql.DB) bool {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		return true // assume empty on error (e.g. table doesn't exist yet)
	}
	return count == 0
}

// seedDevData populates the database with test accounts and fake fish.
// Idempotent: if users already exist, this is a no-op.
func seedDevData(conn *sql.DB, cfg *config.Config) error {
	// Ensure photo directory exists
	photoDir := cfg.PhotoDir
	if err := os.MkdirAll(photoDir, 0755); err != nil {
		return fmt.Errorf("mkdir %s: %w", photoDir, err)
	}

	// ── Users ──────────────────────────────────────────────────────────────
	hash := func(pw string) string {
		h, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
		if err != nil {
			log.Fatalf("bcrypt: %v", err)
		}
		return string(h)
	}

	var adminID, demoID, rybkaID int

	err := conn.QueryRow(
		`INSERT INTO users (username, password_hash, display_name, is_admin)
		 VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO UPDATE SET username=EXCLUDED.username RETURNING id`,
		"admin", hash("admin123"), "Administrator", true,
	).Scan(&adminID)
	if err != nil {
		return fmt.Errorf("create admin: %w", err)
	}
	log.Printf("  admin (id=%d) — login: admin / admin123", adminID)

	conn.QueryRow(
		`INSERT INTO users (username, password_hash, display_name, is_admin)
		 VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO UPDATE SET username=EXCLUDED.username RETURNING id`,
		"demo", hash("demo123"), "Demo User", false,
	).Scan(&demoID)
	log.Printf("  demo (id=%d) — login: demo / demo123", demoID)

	conn.QueryRow(
		`INSERT INTO users (username, password_hash, display_name, is_admin)
		 VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO UPDATE SET username=EXCLUDED.username RETURNING id`,
		"rybka", hash("rybka123"), "Rybka Fan", false,
	).Scan(&rybkaID)
	log.Printf("  rybka (id=%d) — login: rybka / rybka123", rybkaID)

	// ── Fish ───────────────────────────────────────────────────────────────
	type seedFish struct {
		Lat, Lng  float64
		Address   string
		SpottedBy int
	}
	fish := []seedFish{
		{50.0617, 19.9373, "Rynek Główny, przy Sukiennicach", adminID},
		{50.0624, 19.9362, "ul. Floriańska 15, koło bramy", demoID},
		{50.0605, 19.9395, "ul. Grodzka 22, przy kościele", rybkaID},
		{50.0630, 19.9340, "Planty, od strony Teatru im. Słowackiego", adminID},
		{50.0610, 19.9410, "ul. św. Jana 8, na murku", demoID},
	}

	for i, f := range fish {
		filename := fmt.Sprintf("seed_%d.jpg", i+1)
		thumbFilename := fmt.Sprintf("seed_%d_thumb.jpg", i+1)

		// Generate placeholder photos if they don't exist
		for _, p := range []string{
			filepath.Join(photoDir, filename),
			filepath.Join(photoDir, thumbFilename),
		} {
			if _, err := os.Stat(p); os.IsNotExist(err) {
				genPlaceholder(p, i, strings.Contains(p, "_thumb"))
			}
		}

		var fishID int
		err := conn.QueryRow(
			`INSERT INTO fish (photo_filename, latitude, longitude, address_hint, spotted_by, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT DO NOTHING RETURNING id`,
			filename, f.Lat, f.Lng, f.Address, f.SpottedBy,
			time.Now().Add(-time.Duration(i)*24*time.Hour),
		).Scan(&fishID)
		if err == sql.ErrNoRows {
			continue // already exists
		}
		if err != nil {
			log.Printf("  fish %d: %v", i+1, err)
			continue
		}
		log.Printf("  fish #%d (id=%d): %s", i+1, fishID, f.Address)
	}

	// ── Collections ────────────────────────────────────────────────────────
	pairs := []struct {
		fishID int
		userID int
	}{
		{1, demoID},
		{3, demoID},
		{1, rybkaID},
		{2, rybkaID},
		{4, rybkaID},
	}
	for _, p := range pairs {
		conn.Exec(`INSERT INTO collections (fish_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, p.fishID, p.userID)
	}
	log.Printf("  collections: %d created", len(pairs))

	return nil
}

// genPlaceholder creates a tiny gradient JPEG for seed fish photos.
func genPlaceholder(path string, index int, thumb bool) {
	hues := []float64{0.0, 30.0, 120.0, 240.0, 300.0}
	hue := hues[index%len(hues)]

	w, h := 600, 600
	if thumb {
		w, h = 200, 200
	}

	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			r := uint8(math.Sin(float64(x)/float64(w)*math.Pi+hue*math.Pi/180)*127 + 128)
			g := uint8(math.Cos(float64(y)/float64(h)*math.Pi+hue*math.Pi/180)*127 + 128)
			b := uint8(200 - uint8(hue))
			img.Set(x, y, color.RGBA{r, g, b, 255})
		}
	}

	f, err := os.Create(path)
	if err != nil {
		log.Printf("  create placeholder %s: %v", path, err)
		return
	}
	defer f.Close()

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 70}); err != nil {
		log.Printf("  encode placeholder %s: %v", path, err)
		return
	}
	f.Write(buf.Bytes())
}
