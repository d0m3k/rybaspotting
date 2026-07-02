package handlers

import (
	"database/sql"
	"net/http"

	"rybaspotting/internal/config"
)

type AdminHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

// ApproveUser sets is_active = true for a given username, guarded by X-Admin-Token.
func (h *AdminHandler) ApproveUser(w http.ResponseWriter, r *http.Request) {
	token := r.Header.Get("X-Admin-Token")
	if token == "" || token != h.Cfg.AdminToken {
		http.Error(w, `{"error":"invalid admin token"}`, http.StatusForbidden)
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
	token := r.Header.Get("X-Admin-Token")
	if token == "" || token != h.Cfg.AdminToken {
		http.Error(w, `{"error":"invalid admin token"}`, http.StatusForbidden)
		return
	}

	current := h.Cfg.AllowGalleryUpload()
	h.Cfg.SetAllowGalleryUpload(!current)

	writeJSON(w, http.StatusOK, map[string]bool{"allow_gallery_upload": h.Cfg.AllowGalleryUpload()})
}
