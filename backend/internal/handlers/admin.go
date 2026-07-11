package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"rybaspotting/internal/config"
	"rybaspotting/internal/middleware"
	"rybaspotting/internal/models"
	"rybaspotting/internal/storage"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
)

type AdminHandler struct {
	DB      *sql.DB
	Cfg     *config.Config
	Storage storage.Storage
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

	// Delete photo files from storage
	if filename != "" {
		if err := h.Storage.Delete(filename); err != nil {
			log.Printf("[ADMIN] DeleteFish: failed to delete photo %s: %v", filename, err)
		}
		thumbFilename := storage.ThumbFilename(filename)
		if err := h.Storage.Delete(thumbFilename); err != nil {
			log.Printf("[ADMIN] DeleteFish: failed to delete thumbnail %s: %v", thumbFilename, err)
		}
	}

	adminID, _ := r.Context().Value(middleware.ContextUserID).(int)
	log.Printf("[ADMIN] type=delete_fish admin_id=%d fish_id=%d filename=%q", adminID, id, filename)

	writeJSON(w, http.StatusOK, map[string]string{"message": "fish deleted"})
}

type adminUserEntry struct {
	ID          int        `json:"id"`
	Username    string     `json:"username"`
	DisplayName string     `json:"display_name"`
	IsAdmin     bool       `json:"is_admin"`
	Spots       int        `json:"spots"`
	Collects    int        `json:"collects"`
	CreatedAt   time.Time  `json:"created_at"`
	DeletedAt   *time.Time `json:"deleted_at"`
}

type setPasswordRequest struct {
	Username    string `json:"username"`
	NewPassword string `json:"new_password"`
}

// ListUsers returns all users with their spot and collect counts.
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(
		`SELECT u.id, u.username, COALESCE(u.display_name, ''), u.is_admin, u.created_at, u.deleted_at,
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
		if err := rows.Scan(&e.ID, &e.Username, &e.DisplayName, &e.IsAdmin, &e.CreatedAt, &e.DeletedAt,
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

// DeleteUser removes a user. Users with spotted fish are soft-deleted
// (anonymised + blocked). Users with 0 spots are hard-deleted.
func (h *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	if username == "" {
		http.Error(w, `{"error":"username query parameter required"}`, http.StatusBadRequest)
		return
	}

	// Don't allow deleting yourself
	adminID, _ := r.Context().Value(middleware.ContextUserID).(int)
	var adminName string
	h.DB.QueryRow(`SELECT username FROM users WHERE id = $1`, adminID).Scan(&adminName)
	if username == adminName {
		http.Error(w, `{"error":"cannot delete yourself"}`, http.StatusForbidden)
		return
	}

	// Check how many spots this user has
	var spotCount int
	h.DB.QueryRow(`SELECT COUNT(*) FROM fish WHERE spotted_by = (SELECT id FROM users WHERE username = $1)`, username).Scan(&spotCount)

	if spotCount == 0 {
		// Hard delete — no fish to preserve. Collections auto-deleted via ON DELETE CASCADE.
		// Also remove avatar if exists.
		var userID int
		h.DB.QueryRow(`SELECT id FROM users WHERE username = $1`, username).Scan(&userID)

		res, err := h.DB.Exec(`DELETE FROM users WHERE username = $1`, username)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		rows, _ := res.RowsAffected()
		if rows == 0 {
			http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
			return
		}

		// Clean up avatar
		if err := h.Storage.Delete(storage.AvatarKey(userID)); err != nil {
			log.Printf("[ADMIN] DeleteUser: failed to delete avatar for %d: %v", userID, err)
		}

		adminID, _ = r.Context().Value(middleware.ContextUserID).(int)
		log.Printf("[ADMIN] type=hard_delete_user admin_id=%d target=%s spots=0", adminID, username)

		writeJSON(w, http.StatusOK, map[string]string{"message": "user permanently deleted"})
		return
	}

	// Soft delete — user has spotted fish, preserve their data.
	res, err := h.DB.Exec(
		`UPDATE users SET deleted_at = NOW(), display_name = 'usunięty' WHERE username = $1 AND deleted_at IS NULL`,
		username,
	)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		http.Error(w, `{"error":"user not found or already deleted"}`, http.StatusNotFound)
		return
	}

	adminID, _ = r.Context().Value(middleware.ContextUserID).(int)
	log.Printf("[ADMIN] type=soft_delete_user admin_id=%d target=%s spots=%d", adminID, username, spotCount)

	writeJSON(w, http.StatusOK, map[string]string{"message": "user deleted (fish preserved)"})
}

// RestoreUser clears deleted_at, allowing the user to log in again.
func (h *AdminHandler) RestoreUser(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	if username == "" {
		http.Error(w, `{"error":"username query parameter required"}`, http.StatusBadRequest)
		return
	}

	res, err := h.DB.Exec(
		`UPDATE users SET deleted_at = NULL WHERE username = $1 AND deleted_at IS NOT NULL`,
		username,
	)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		http.Error(w, `{"error":"user not found or not deleted"}`, http.StatusNotFound)
		return
	}

	adminID, _ := r.Context().Value(middleware.ContextUserID).(int)
	log.Printf("[ADMIN] type=restore_user admin_id=%d target=%s", adminID, username)

	writeJSON(w, http.StatusOK, map[string]string{"message": "user restored"})
}

// Stats returns admin dashboard stats.
func (h *AdminHandler) Stats(w http.ResponseWriter, r *http.Request) {
	var resp adminStatsResponse

	h.DB.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&resp.UserCount)
	h.DB.QueryRow(`SELECT COUNT(*) FROM fish`).Scan(&resp.FishCount)

	// Count photos and total size from storage
	count, countErr := h.Storage.Count()
	size, sizeErr := h.Storage.TotalSize()
	if countErr == nil {
		resp.PhotoCount = count
	}
	if sizeErr == nil {
		resp.PhotoSizeMB = size / (1024 * 1024)
	}

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

type updateFishLocationRequest struct {
	Latitude    *float64 `json:"latitude"`
	Longitude   *float64 `json:"longitude"`
	AddressHint *string  `json:"address_hint"`
}

// UpdateFishLocation lets an admin fix the location or address hint of an existing fish.
func (h *AdminHandler) UpdateFishLocation(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid fish id"}`, http.StatusBadRequest)
		return
	}

	var req updateFishLocationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// At least one field must be provided
	if req.Latitude == nil && req.Longitude == nil && req.AddressHint == nil {
		http.Error(w, `{"error":"at least one of latitude, longitude, or address_hint is required"}`, http.StatusBadRequest)
		return
	}

	// Validate coords if provided
	if req.Latitude != nil && (math.IsNaN(*req.Latitude) || math.IsInf(*req.Latitude, 0) || *req.Latitude < -90 || *req.Latitude > 90) {
		http.Error(w, `{"error":"invalid latitude"}`, http.StatusBadRequest)
		return
	}
	if req.Longitude != nil && (math.IsNaN(*req.Longitude) || math.IsInf(*req.Longitude, 0) || *req.Longitude < -180 || *req.Longitude > 180) {
		http.Error(w, `{"error":"invalid longitude"}`, http.StatusBadRequest)
		return
	}

	// Check fish exists
	var currentLat, currentLng float64
	var currentAddr string
	err = h.DB.QueryRow(`SELECT latitude, longitude, address_hint FROM fish WHERE id = $1`, id).Scan(&currentLat, &currentLng, &currentAddr)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"fish not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Update only provided fields
	newLat := currentLat
	newLng := currentLng
	newAddr := currentAddr
	if req.Latitude != nil {
		newLat = *req.Latitude
	}
	if req.Longitude != nil {
		newLng = *req.Longitude
	}
	if req.AddressHint != nil {
		newAddr = *req.AddressHint
	}

	_, err = h.DB.Exec(`UPDATE fish SET latitude = $1, longitude = $2, address_hint = $3 WHERE id = $4`,
		newLat, newLng, newAddr, id)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	adminID, _ := r.Context().Value(middleware.ContextUserID).(int)
	log.Printf("[ADMIN] type=update_fish_location admin_id=%d fish_id=%d lat=%.5f->%.5f lng=%.5f->%.5f",
		adminID, id, currentLat, newLat, currentLng, newLng)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":      "fish location updated",
		"latitude":     newLat,
		"longitude":    newLng,
		"address_hint": newAddr,
	})
}

type mergeCandidate struct {
	models.Fish
	DistanceMeters float64 `json:"distance_meters"`
}

// MergeCandidates returns fish near the given fish, sorted by distance, for admin merge selection.
func (h *AdminHandler) MergeCandidates(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid fish id"}`, http.StatusBadRequest)
		return
	}

	// Get the source fish location
	var srcLat, srcLng float64
	err = h.DB.QueryRow(`SELECT latitude, longitude FROM fish WHERE id = $1`, id).Scan(&srcLat, &srcLng)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"fish not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Find all other fish, compute distance, sort by distance
	// Use a generous bounding box (approx 500 km) and limit to 50 candidates
	rows, err := h.DB.Query(`
		SELECT f.id, f.photo_filename, f.latitude, f.longitude, f.address_hint,
		       f.spotted_by, COALESCE(NULLIF(u.display_name, ''), u.username), f.created_at,
		       2 * 6371000 * asin(sqrt(
		         pow(sin(radians(f.latitude  - $1) / 2), 2)
		       + cos(radians($1)) * cos(radians(f.latitude)) * pow(sin(radians(f.longitude - $2) / 2), 2)
		       )) AS distance
		FROM fish f
		JOIN users u ON u.id = f.spotted_by
		WHERE f.id != $3
		ORDER BY distance ASC
		LIMIT 50
	`, srcLat, srcLng, id)
	if err != nil {
		log.Printf("[ADMIN] MergeCandidates query error: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	candidates := []mergeCandidate{}
	for rows.Next() {
		var mc mergeCandidate
		if err := rows.Scan(&mc.ID, &mc.PhotoFilename, &mc.Latitude, &mc.Longitude,
			&mc.AddressHint, &mc.SpottedBy, &mc.SpotterName, &mc.CreatedAt,
			&mc.DistanceMeters); err != nil {
			log.Printf("[ADMIN] MergeCandidates scan error: %v", err)
			continue
		}
		mc.DistanceMeters = math.Round(mc.DistanceMeters*100) / 100
		if mc.PhotoFilename != "" {
			mc.PhotoURL = h.Storage.PublicURL(mc.PhotoFilename)
		}
		candidates = append(candidates, mc)
	}

	writeJSON(w, http.StatusOK, candidates)
}

// MergeFish merges the source fish (id) into the target fish.
// Collections from source are transferred to target (duplicates skipped).
// Source fish and its photos are deleted.
func (h *AdminHandler) MergeFish(w http.ResponseWriter, r *http.Request) {
	sourceIDStr := chi.URLParam(r, "id")
	sourceID, err := strconv.Atoi(sourceIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid source fish id"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		TargetID int `json:"target_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.TargetID == 0 {
		http.Error(w, `{"error":"target_id is required"}`, http.StatusBadRequest)
		return
	}
	if req.TargetID == sourceID {
		http.Error(w, `{"error":"cannot merge a fish into itself"}`, http.StatusBadRequest)
		return
	}

	// Verify both fish exist
	var sourceFilename string
	err = h.DB.QueryRow(`SELECT photo_filename FROM fish WHERE id = $1`, sourceID).Scan(&sourceFilename)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"source fish not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	var targetExists bool
	h.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM fish WHERE id = $1)`, req.TargetID).Scan(&targetExists)
	if !targetExists {
		http.Error(w, `{"error":"target fish not found"}`, http.StatusNotFound)
		return
	}

	// Transfer collections: move all collectors from source to target, skip duplicates (ON CONFLICT DO NOTHING)
	// First get collection count
	var collCount int
	h.DB.QueryRow(`SELECT COUNT(*) FROM collections WHERE fish_id = $1`, sourceID).Scan(&collCount)

	_, err = h.DB.Exec(`
		INSERT INTO collections (fish_id, user_id, created_at)
		SELECT $1, c.user_id, c.created_at
		FROM collections c
		WHERE c.fish_id = $2
		ON CONFLICT (fish_id, user_id) DO NOTHING
	`, req.TargetID, sourceID)
	if err != nil {
		log.Printf("[ADMIN] MergeFish transfer collections error: %v", err)
		http.Error(w, `{"error":"failed to transfer collections"}`, http.StatusInternalServerError)
		return
	}

	// Delete source fish from DB (collections cascade)
	_, err = h.DB.Exec(`DELETE FROM fish WHERE id = $1`, sourceID)
	if err != nil {
		http.Error(w, `{"error":"failed to delete source fish"}`, http.StatusInternalServerError)
		return
	}

	// Delete source photos from storage
	if sourceFilename != "" {
		if err := h.Storage.Delete(sourceFilename); err != nil {
			log.Printf("[ADMIN] MergeFish: failed to delete photo %s: %v", sourceFilename, err)
		}
		thumbFilename := storage.ThumbFilename(sourceFilename)
		if err := h.Storage.Delete(thumbFilename); err != nil {
			log.Printf("[ADMIN] MergeFish: failed to delete thumbnail %s: %v", thumbFilename, err)
		}
	}

	adminID, _ := r.Context().Value(middleware.ContextUserID).(int)
	log.Printf("[ADMIN] type=merge_fish admin_id=%d source_id=%d target_id=%d collections_moved=%d",
		adminID, sourceID, req.TargetID, collCount)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":           "fish merged",
		"source_id":         sourceID,
		"target_id":         req.TargetID,
		"collections_moved": collCount,
	})
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
