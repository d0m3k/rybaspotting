package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"rybaspotting/internal/config"
	"rybaspotting/internal/middleware"
	"rybaspotting/internal/storage"

	"github.com/disintegration/imaging"
	"github.com/go-chi/chi/v5"
)

type UserHandler struct {
	DB      *sql.DB
	Cfg     *config.Config
	Storage storage.Storage
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
	PhotoURL      string    `json:"photo_url,omitempty"`
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

	// Check avatar via storage
	resp.HasAvatar = h.Storage.Exists(storage.AvatarKey(userID))

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
		if f.PhotoFilename != "" {
			f.PhotoURL = h.Storage.PublicURL(f.PhotoFilename)
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

	// Decode, crop to 200x200 square, upload via storage
	src, err := imaging.Decode(file, imaging.AutoOrientation(true))
	if err != nil {
		http.Error(w, `{"error":"invalid image"}`, http.StatusBadRequest)
		return
	}

	avatarURL, err := h.Storage.StoreAvatarJPEG(userID, src)
	if err != nil {
		log.Printf("[USER] avatar upload error: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	log.Printf("[USER] type=avatar_upload user_id=%d url=%s", userID, avatarURL)
	writeJSON(w, http.StatusOK, map[string]string{"message": "avatar uploaded", "avatar_url": avatarURL})
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

// DeleteMyAccount performs a hard delete of the authenticated user: removes all
// fish they spotted (with photos), all their collections, their avatar, and the
// user record itself. This is irreversible.
func (h *UserHandler) DeleteMyAccount(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.ContextUserID).(int)

	// ── Gather all fish IDs spotted by this user ──────────────────────
	rows, err := h.DB.Query(`SELECT id, photo_filename FROM fish WHERE spotted_by = $1`, userID)
	if err != nil {
		log.Printf("[USER] type=delete_account user_id=%d error=%v", userID, err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	type fishRow struct {
		ID       int
		Filename string
	}
	var fishToDelete []fishRow
	for rows.Next() {
		var f fishRow
		if err := rows.Scan(&f.ID, &f.Filename); err != nil {
			continue
		}
		fishToDelete = append(fishToDelete, f)
	}
	rows.Close()

	// ── Delete fish photos from storage (R2 or local disk) ───────────
	for _, f := range fishToDelete {
		if err := h.Storage.Delete(f.Filename); err != nil {
			log.Printf("[USER] delete_photo user_id=%d key=%s error=%v", userID, f.Filename, err)
		}
		thumbKey := storage.ThumbFilename(f.Filename)
		if err := h.Storage.Delete(thumbKey); err != nil {
			log.Printf("[USER] delete_photo user_id=%d key=%s error=%v", userID, thumbKey, err)
		}
	}

	// ── Delete fish rows (cascades to collections) ────────────────────
	if len(fishToDelete) > 0 {
		ids := make([]string, len(fishToDelete))
		args := make([]interface{}, len(fishToDelete)+1)
		args[0] = userID
		for i, f := range fishToDelete {
			ids[i] = fmt.Sprintf("$%d", i+2)
			args[i+1] = f.ID
		}
		// Use a single DELETE with IN clause — the spotted_by check is belt-and-suspenders
		query := fmt.Sprintf(`DELETE FROM fish WHERE spotted_by = $1 AND id IN (%s)`, strings.Join(ids, ","))
		if _, err := h.DB.Exec(query, args...); err != nil {
			log.Printf("[USER] type=delete_account user_id=%d error=%v", userID, err)
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
	}

	// ── Delete user's own collections (fish they collected but didn't spot) ──
	if _, err := h.DB.Exec(`DELETE FROM collections WHERE user_id = $1`, userID); err != nil {
		log.Printf("[USER] type=delete_account user_id=%d error=%v", userID, err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// ── Delete avatar (from R2 or local disk) ────────────────────────
	avatarKey := storage.AvatarKey(userID)
	if err := h.Storage.Delete(avatarKey); err != nil {
		log.Printf("[USER] delete_avatar user_id=%d key=%s error=%v", userID, avatarKey, err)
	}

	// ── Hard delete the user ──────────────────────────────────────────
	result, err := h.DB.Exec(`DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		log.Printf("[USER] type=delete_account user_id=%d error=%v", userID, err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	log.Printf("[USER] type=delete_account user_id=%d spotted_fish=%d", userID, len(fishToDelete))
	writeJSON(w, http.StatusOK, map[string]string{"message": "account permanently deleted"})
}

// ServeAvatar serves a user's profile picture by user ID.
func (h *UserHandler) ServeAvatar(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "userID")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "invalid user id", http.StatusBadRequest)
		return
	}

	avatarURL := h.Storage.PublicURL(storage.AvatarKey(id))
	if avatarURL == "" {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// If it's an absolute URL (R2), redirect. Otherwise serve locally.
	if strings.HasPrefix(avatarURL, "http://") || strings.HasPrefix(avatarURL, "https://") {
		http.Redirect(w, r, avatarURL, http.StatusFound)
		return
	}

	// Fallback: local path — check existence and serve
	if !h.Storage.Exists(storage.AvatarKey(id)) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	http.ServeFile(w, r, avatarURL)
}
