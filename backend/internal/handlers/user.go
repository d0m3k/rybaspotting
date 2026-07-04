package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"rybaspotting/internal/config"
	"rybaspotting/internal/middleware"

	"github.com/disintegration/imaging"
	"github.com/go-chi/chi/v5"
)

type UserHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

type userStatsResponse struct {
	UserID      int    `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	IsAdmin     bool   `json:"is_admin"`
	Spotted     int    `json:"spotted"`
	Collected   int    `json:"collected"`
	HasAvatar   bool   `json:"has_avatar"`
}

type collectedFishResponse struct {
	ID            int       `json:"id"`
	PhotoFilename string    `json:"photo_filename"`
	Latitude      float64   `json:"latitude"`
	Longitude     float64   `json:"longitude"`
	AddressHint   string    `json:"address_hint"`
	SpotterName   string    `json:"spotter_name"`
	CreatedAt     time.Time `json:"created_at"`
	CollectedAt   time.Time `json:"collected_at"`
}

func (h *UserHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.ContextUserID).(int)

	var resp userStatsResponse
	resp.UserID = userID

	// Get user info
	err := h.DB.QueryRow(
		`SELECT username, display_name, is_admin FROM users WHERE id = $1`,
		userID,
	).Scan(&resp.Username, &resp.DisplayName, &resp.IsAdmin)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	// Count spotted fish
	h.DB.QueryRow(
		`SELECT COUNT(*) FROM fish WHERE spotted_by = $1`, userID,
	).Scan(&resp.Spotted)

	// Count collected fish
	h.DB.QueryRow(
		`SELECT COUNT(*) FROM collections WHERE user_id = $1`, userID,
	).Scan(&resp.Collected)

	// Check avatar
	avatarPath := filepath.Join(h.Cfg.PhotoDir, "avatars", fmt.Sprintf("%d.jpg", userID))
	if _, err := os.Stat(avatarPath); err == nil {
		resp.HasAvatar = true
	}

	writeJSON(w, http.StatusOK, resp)
}

// MyCollections returns fish that the authenticated user has collected.
func (h *UserHandler) MyCollections(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.ContextUserID).(int)

	rows, err := h.DB.Query(
		`SELECT f.id, f.photo_filename, f.latitude, f.longitude, f.address_hint,
		        COALESCE(NULLIF(u.display_name, ''), u.username), f.created_at, c.created_at
		 FROM collections c
		 JOIN fish f ON f.id = c.fish_id
		 JOIN users u ON u.id = f.spotted_by
		 WHERE c.user_id = $1
		 ORDER BY c.created_at DESC
		 LIMIT 200`, userID,
	)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := []collectedFishResponse{}
	for rows.Next() {
		var f collectedFishResponse
		if err := rows.Scan(&f.ID, &f.PhotoFilename, &f.Latitude, &f.Longitude,
			&f.AddressHint, &f.SpotterName, &f.CreatedAt, &f.CollectedAt); err != nil {
			continue
		}
		result = append(result, f)
	}

	writeJSON(w, http.StatusOK, result)
}

// UploadAvatar handles profile picture upload. Always replaces the old one.
func (h *UserHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.ContextUserID).(int)

	if err := r.ParseMultipartForm(2 << 20); err != nil {
		http.Error(w, `{"error":"file too large (max 2MB)"}`, http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("avatar")
	if err != nil {
		http.Error(w, `{"error":"avatar file required"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Ensure avatars directory exists
	avatarDir := filepath.Join(h.Cfg.PhotoDir, "avatars")
	if err := os.MkdirAll(avatarDir, 0755); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Decode, crop to 200x200 square, save as JPEG
	src, err := imaging.Decode(file, imaging.AutoOrientation(true))
	if err != nil {
		http.Error(w, `{"error":"invalid image"}`, http.StatusBadRequest)
		return
	}

	thumb := imaging.Fill(src, 200, 200, imaging.Center, imaging.Lanczos)

	// Save as {userId}.jpg — always replaces
	avatarPath := filepath.Join(avatarDir, fmt.Sprintf("%d.jpg", userID))
	out, err := os.Create(avatarPath)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	defer out.Close()

	if err := imaging.Encode(out, thumb, imaging.JPEG, imaging.JPEGQuality(80)); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	log.Printf("[USER] type=avatar_upload user_id=%d", userID)
	writeJSON(w, http.StatusOK, map[string]string{"message": "avatar uploaded"})
}

// UpdateDisplayName updates the user's display name.
func (h *UserHandler) UpdateDisplayName(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.ContextUserID).(int)

	var req struct {
		DisplayName string `json:"display_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if req.DisplayName == "" {
		http.Error(w, `{"error":"display name cannot be empty"}`, http.StatusBadRequest)
		return
	}
	if len(req.DisplayName) > 50 {
		http.Error(w, `{"error":"display name too long (max 50)"}`, http.StatusBadRequest)
		return
	}

	_, err := h.DB.Exec(`UPDATE users SET display_name = $1 WHERE id = $2`, req.DisplayName, userID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	log.Printf("[USER] type=update_display_name user_id=%d name=%q", userID, req.DisplayName)
	writeJSON(w, http.StatusOK, map[string]string{"message": "display name updated", "display_name": req.DisplayName})
}

// ServeAvatar serves a user's profile picture by user ID.
func (h *UserHandler) ServeAvatar(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "userID")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "invalid user id", http.StatusBadRequest)
		return
	}

	avatarPath := filepath.Join(h.Cfg.PhotoDir, "avatars", fmt.Sprintf("%d.jpg", id))
	if _, err := os.Stat(avatarPath); os.IsNotExist(err) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// Security: validate the path doesn't escape
	if strings.Contains(avatarPath, "..") {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	http.ServeFile(w, r, avatarPath)
}
