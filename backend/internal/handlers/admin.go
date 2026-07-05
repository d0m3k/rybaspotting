package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"rybaspotting/internal/config"
	"rybaspotting/internal/middleware"
	"rybaspotting/internal/models"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
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

// DemoteUser removes admin privileges from a user.
func (h *AdminHandler) DemoteUser(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	if username == "" {
		http.Error(w, `{"error":"username query parameter required"}`, http.StatusBadRequest)
		return
	}

	// Don't allow demoting yourself
	adminID, _ := r.Context().Value(middleware.ContextUserID).(int)
	var adminName string
	h.DB.QueryRow(`SELECT username FROM users WHERE id = $1`, adminID).Scan(&adminName)
	if username == adminName {
		http.Error(w, `{"error":"cannot demote yourself"}`, http.StatusForbidden)
		return
	}

	res, err := h.DB.Exec(
		`UPDATE users SET is_admin = false WHERE username = $1`,
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

	log.Printf("[ADMIN] type=demote_user admin_id=%d target=%s", adminID, username)

	writeJSON(w, http.StatusOK, map[string]string{"message": "user demoted from admin"})
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
		        f.spotted_by, COALESCE(NULLIF(u.display_name, ''), u.username), f.created_at
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

type adminUserEntry struct {
	ID          int       `json:"id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name"`
	IsAdmin     bool      `json:"is_admin"`
	Spots       int       `json:"spots"`
	Collects    int       `json:"collects"`
	CreatedAt   time.Time `json:"created_at"`
}

type setPasswordRequest struct {
	Username    string `json:"username"`
	NewPassword string `json:"new_password"`
}

// ListUsers returns all users with their spot and collect counts.
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(
		`SELECT u.id, u.username, COALESCE(u.display_name, ''), u.is_admin, u.created_at,
		        COUNT(DISTINCT f.id)::int, COUNT(DISTINCT c.id)::int
		 FROM users u
		 LEFT JOIN fish f ON f.spotted_by = u.id
		 LEFT JOIN collections c ON c.user_id = u.id
		 GROUP BY u.id
		 ORDER BY u.created_at DESC`,
	)
	if err != nil {
		log.Printf("[ADMIN] ListUsers query error: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := []adminUserEntry{}
	for rows.Next() {
		var e adminUserEntry
		if err := rows.Scan(&e.ID, &e.Username, &e.DisplayName, &e.IsAdmin, &e.CreatedAt,
			&e.Spots, &e.Collects); err != nil {
			log.Printf("[ADMIN] ListUsers scan error: %v", err)
			continue
		}
		result = append(result, e)
	}

	writeJSON(w, http.StatusOK, result)
}

// SetPassword lets an admin reset a user's password.
func (h *AdminHandler) SetPassword(w http.ResponseWriter, r *http.Request) {
	var req setPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.NewPassword = strings.TrimSpace(req.NewPassword)
	if req.Username == "" || req.NewPassword == "" {
		http.Error(w, `{"error":"username and new_password required"}`, http.StatusBadRequest)
		return
	}
	if len(req.NewPassword) < 4 {
		http.Error(w, `{"error":"password must be at least 4 characters"}`, http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	res, err := h.DB.Exec(`UPDATE users SET password_hash = $1 WHERE username = $2`,
		string(hash), req.Username)
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
	log.Printf("[ADMIN] type=set_password admin_id=%d target=%s", adminID, req.Username)

	writeJSON(w, http.StatusOK, map[string]string{"message": "password updated"})
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

// ListCollections returns all collections for admin review.
func (h *AdminHandler) ListCollections(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(
		`SELECT c.id, c.fish_id, COALESCE(NULLIF(cu.display_name, ''), cu.username), COALESCE(NULLIF(su.display_name, ''), su.username), f.latitude, f.longitude, c.created_at
		 FROM collections c
		 JOIN fish f ON f.id = c.fish_id
		 JOIN users cu ON cu.id = c.user_id
		 JOIN users su ON su.id = f.spotted_by
		 ORDER BY c.created_at DESC
		 LIMIT 500`,
	)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := []models.AdminCollectionEntry{}
	for rows.Next() {
		var e models.AdminCollectionEntry
		if err := rows.Scan(&e.ID, &e.FishID, &e.CollectorName, &e.SpotterName,
			&e.Latitude, &e.Longitude, &e.CreatedAt); err != nil {
			continue
		}
		result = append(result, e)
	}

	writeJSON(w, http.StatusOK, result)
}

// DeleteCollection removes a collection entry.
func (h *AdminHandler) DeleteCollection(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid collection id"}`, http.StatusBadRequest)
		return
	}

	res, err := h.DB.Exec(`DELETE FROM collections WHERE id = $1`, id)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		http.Error(w, `{"error":"collection not found"}`, http.StatusNotFound)
		return
	}

	adminID, _ := r.Context().Value(middleware.ContextUserID).(int)
	log.Printf("[ADMIN] type=delete_collection admin_id=%d collection_id=%d", adminID, id)

	writeJSON(w, http.StatusOK, map[string]string{"message": "collection deleted"})
}
