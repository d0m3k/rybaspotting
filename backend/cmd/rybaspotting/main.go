package main

import (
	"log"
	"net/http"
	"os"

	"rybaspotting/internal/config"
	"rybaspotting/internal/db"
	"rybaspotting/internal/handlers"
	"rybaspotting/internal/middleware"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
)

func main() {
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

	// Initialize handlers
	authH := &handlers.AuthHandler{DB: conn, Cfg: cfg}
	adminH := &handlers.AdminHandler{DB: conn, Cfg: cfg}
	fishH := &handlers.FishHandler{DB: conn, Cfg: cfg}
	collectH := &handlers.CollectHandler{DB: conn}
	leaderboardH := &handlers.LeaderboardHandler{DB: conn}

	// Build router
	r := chi.NewRouter()

	// Middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RealIP)
	r.Use(corsMiddleware)

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

		// Auth-protected endpoints
		r.Group(func(r chi.Router) {
			r.Use(middleware.AuthMiddleware(cfg))
			r.Use(middleware.RequireActive)

			r.Post("/fish", fishH.Create)
			r.Post("/fish/{id}/collect", collectH.Collect)
			r.Delete("/fish/{id}/collect", collectH.Uncollect)
		})

		// Admin endpoints (protected by X-Admin-Token)
		r.Post("/admin/approve-user", adminH.ApproveUser)
		r.Post("/admin/toggle-upload-mode", adminH.ToggleGalleryUpload)
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
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token, X-Live-Capture")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
