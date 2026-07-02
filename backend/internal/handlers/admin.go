package handlers

import (
	"database/sql"
	"net/http"
	"os"

	"rybaspotting/internal/config"
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

// ApproveUser sets is_active = true for a given username, guarded by X-Admin-Token.
func (h *AdminHandler) ApproveUser(w http.ResponseWriter, r *http.Request) {
	if !checkAdminToken(w, r, h.Cfg) {
		return
	}

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

	writeJSON(w, http.StatusOK, map[string]string{"message": "user approved"})
}

// ToggleGalleryUpload flips the runtime allowGalleryUpload flag.
func (h *AdminHandler) ToggleGalleryUpload(w http.ResponseWriter, r *http.Request) {
	if !checkAdminToken(w, r, h.Cfg) {
		return
	}

	current := h.Cfg.AllowGalleryUpload()
	h.Cfg.SetAllowGalleryUpload(!current)

	writeJSON(w, http.StatusOK, map[string]bool{"allow_gallery_upload": h.Cfg.AllowGalleryUpload()})
}

// Stats returns admin dashboard stats: user count, fish count, photo count.
func (h *AdminHandler) Stats(w http.ResponseWriter, r *http.Request) {
	if !checkAdminToken(w, r, h.Cfg) {
		return
	}

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
	// Convert bytes to MB
	resp.PhotoSizeMB = resp.PhotoSizeMB / (1024 * 1024)

	writeJSON(w, http.StatusOK, resp)
}
