package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"rybaspotting/internal/config"
	"rybaspotting/internal/middleware"
	"rybaspotting/internal/models"

	"github.com/go-chi/chi/v5"
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

// PromoteUser promotes a user to admin by username.
func (h *AdminHandler) PromoteUser(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	if username == "" {
		http.Error(w, `{"error":"username query parameter required"}`, http.StatusBadRequest)
		return
	}

	res, err := h.DB.Exec(
		`UPDATE users SET is_admin = true WHERE username = $1`,
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

// ToggleGalleryUpload flips the runtime allowGalleryUpload flag.
func (h *AdminHandler) ToggleGalleryUpload(w http.ResponseWriter, r *http.Request) {
	current := h.Cfg.AllowGalleryUpload()
	h.Cfg.SetAllowGalleryUpload(!current)

	adminID, _ := r.Context().Value(middleware.ContextUserID).(int)
	log.Printf("[ADMIN] type=toggle_gallery admin_id=%d allow_gallery_upload=%v", adminID, !current)

	writeJSON(w, http.StatusOK, map[string]bool{"allow_gallery_upload": h.Cfg.AllowGalleryUpload()})
}

// ListAllFish returns all fish entries with full details for admin review.
func (h *AdminHandler) ListAllFish(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(
		`SELECT f.id, f.photo_filename, f.latitude, f.longitude, f.address_hint,
		        f.spotted_by, u.username, f.created_at
		 FROM fish f
		 JOIN users u ON u.id = f.spotted_by
		 ORDER BY f.created_at DESC`,
	)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	fishList := []models.Fish{}
	for rows.Next() {
		var f models.Fish
		if err := rows.Scan(&f.ID, &f.PhotoFilename, &f.Latitude, &f.Longitude,
			&f.AddressHint, &f.SpottedBy, &f.SpotterName, &f.CreatedAt); err != nil {
			log.Printf("[ADMIN] ListAllFish scan error: %v", err)
			continue
		}
		fishList = append(fishList, f)
	}

	writeJSON(w, http.StatusOK, fishList)
}

// DeleteFish hard-deletes a fish entry and its associated photo files.
func (h *AdminHandler) DeleteFish(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid fish id"}`, http.StatusBadRequest)
		return
	}

	// Get photo filename before deleting
	var filename string
	err = h.DB.QueryRow(`SELECT photo_filename FROM fish WHERE id = $1`, id).Scan(&filename)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"fish not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Delete from DB (collections cascade via ON DELETE CASCADE)
	_, err = h.DB.Exec(`DELETE FROM fish WHERE id = $1`, id)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Delete photo files from disk
	if filename != "" {
		ext := filepath.Ext(filename)
		baseName := filename[:len(filename)-len(ext)]

		// Full photo
		photoPath := filepath.Join(h.Cfg.PhotoDir, filename)
		if err := os.Remove(photoPath); err != nil && !os.IsNotExist(err) {
			log.Printf("[ADMIN] DeleteFish: failed to remove photo %s: %v", photoPath, err)
		}

		// Thumbnail (filename_thumb.ext)
		thumbFilename := baseName + "_thumb" + ext
		thumbPath := filepath.Join(h.Cfg.PhotoDir, thumbFilename)
		if err := os.Remove(thumbPath); err != nil && !os.IsNotExist(err) {
			log.Printf("[ADMIN] DeleteFish: failed to remove thumbnail %s: %v", thumbPath, err)
		}
	}

	adminID, _ := r.Context().Value(middleware.ContextUserID).(int)
	log.Printf("[ADMIN] type=delete_fish admin_id=%d fish_id=%d filename=%q", adminID, id, filename)

	writeJSON(w, http.StatusOK, map[string]string{"message": "fish deleted"})
}

// Stats returns admin dashboard stats.
func (h *AdminHandler) Stats(w http.ResponseWriter, r *http.Request) {
	var resp adminStatsResponse

	h.DB.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&resp.UserCount)
	h.DB.QueryRow(`SELECT COUNT(*) FROM fish`).Scan(&resp.FishCount)

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
