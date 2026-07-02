package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"os"

	"rybaspotting/internal/config"
	"rybaspotting/internal/middleware"
)

type AdminHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

type adminStatsResponse struct {
	UserCount    int   `json:"user_count"`
	FishCount    int   `json:"fish_count"`
	PhotoCount   int   `json:"photo_count"`
	PhotoSizeMB  int64 `json:"photo_size_mb"`
}

// ApproveUser sets is_active = true for a given username.
// Protected by JWT admin check in the router.
func (h *AdminHandler) ApproveUser(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	if username == "" {
		http.Error(w, `{"error":"username query parameter required"}`, http.StatusBadRequest)
		return
	}

	res, err := h.DB.Exec(`UPDATE users SET is_active = true WHERE username = $1 AND is_active = false`, username)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		http.Error(w, `{"error":"user not found or already active"}`, http.StatusNotFound)
		return
	}

	// Log who approved whom
	adminID, _ := r.Context().Value(middleware.ContextUserID).(int)
	log.Printf("[ADMIN] type=approve_user admin_id=%d target=%s", adminID, username)

	writeJSON(w, http.StatusOK, map[string]string{"message": "user approved"})
}

// ToggleGalleryUpload flips the runtime allowGalleryUpload flag.
func (h *AdminHandler) ToggleGalleryUpload(w http.ResponseWriter, r *http.Request) {
	current := h.Cfg.AllowGalleryUpload()
	h.Cfg.SetAllowGalleryUpload(!current)

	adminID, _ := r.Context().Value(middleware.ContextUserID).(int)
	log.Printf("[ADMIN] type=toggle_gallery admin_id=%d allow_gallery_upload=%v", adminID, !current)

	writeJSON(w, http.StatusOK, map[string]bool{"allow_gallery_upload": h.Cfg.AllowGalleryUpload()})
}

// Stats returns admin dashboard stats.
func (h *AdminHandler) Stats(w http.ResponseWriter, r *http.Request) {
	var resp adminStatsResponse

	h.DB.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&resp.UserCount)
	h.DB.QueryRow(`SELECT COUNT(*) FROM fish`).Scan(&resp.FishCount)

	// Count photo files in the photo directory
	if ents, err := os.ReadDir(h.Cfg.PhotoDir); err == nil {
		for _, e := range ents {
			if e.IsDir() {
				continue
			}
			resp.PhotoCount++
			if info, err := e.Info(); err == nil {
				resp.PhotoSizeMB += info.Size()
			}
		}
	}
	resp.PhotoSizeMB = resp.PhotoSizeMB / (1024 * 1024)

	writeJSON(w, http.StatusOK, resp)
}

// PromoteUser promotes a user to admin by username.
func (h *AdminHandler) PromoteUser(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	if username == "" {
		http.Error(w, `{"error":"username query parameter required"}`, http.StatusBadRequest)
		return
	}

	res, err := h.DB.Exec(
		`UPDATE users SET is_admin = true, is_active = true WHERE username = $1`,
		username,
	)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	adminID, _ := r.Context().Value(middleware.ContextUserID).(int)
	log.Printf("[ADMIN] type=promote_user admin_id=%d target=%s", adminID, username)

	writeJSON(w, http.StatusOK, map[string]string{"message": "user promoted to admin"})
}
