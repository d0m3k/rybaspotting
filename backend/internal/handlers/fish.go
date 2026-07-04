package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"rybaspotting/internal/config"
	"rybaspotting/internal/middleware"
	"rybaspotting/internal/models"

	"github.com/disintegration/imaging"
	"github.com/go-chi/chi/v5"
)

type FishHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

func (h *FishHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.ContextUserID).(int)

	// Check upload mode
	if !h.Cfg.AllowGalleryUpload() {
		// Only allow "live capture" — the frontend should set this header
		if r.Header.Get("X-Live-Capture") != "true" {
			http.Error(w, `{"error":"gallery upload is disabled; only live capture is allowed"}`, http.StatusForbidden)
			return
		}
	}

	// Parse multipart form (max 10 MB)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, `{"error":"failed to parse form"}`, http.StatusBadRequest)
		return
	}

	lat, err := strconv.ParseFloat(r.FormValue("latitude"), 64)
	if err != nil || math.IsNaN(lat) || math.IsInf(lat, 0) {
		http.Error(w, `{"error":"invalid latitude"}`, http.StatusBadRequest)
		return
	}
	lng, err := strconv.ParseFloat(r.FormValue("longitude"), 64)
	if err != nil || math.IsNaN(lng) || math.IsInf(lng, 0) {
		http.Error(w, `{"error":"invalid longitude"}`, http.StatusBadRequest)
		return
	}
	addressHint := r.FormValue("address_hint")

	file, header, err := r.FormFile("photo")
	if err != nil {
		http.Error(w, `{"error":"photo required"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Ensure photo directory exists
	if err := os.MkdirAll(h.Cfg.PhotoDir, 0755); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Decode, downscale, and save photo
	src, err := imaging.Decode(file, imaging.AutoOrientation(true))
	if err != nil {
		http.Error(w, `{"error":"invalid image file"}`, http.StatusBadRequest)
		return
	}

	// Downscale to MaxPhotoWidth (Resize handles height=0 as "auto")
	resized := imaging.Resize(src, h.Cfg.MaxPhotoWidth, 0, imaging.Lanczos)

	// Generate thumbnail (200px wide)
	thumb := imaging.Resize(src, 200, 0, imaging.Lanczos)

	// Insert fish row to get ID
	var fishID int
	err = h.DB.QueryRow(
		`INSERT INTO fish (photo_filename, latitude, longitude, address_hint, spotted_by)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		"", lat, lng, addressHint, userID,
	).Scan(&fishID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// If anything fails from here on, clean up the orphan fish row.
	ok := false
	defer func() {
		if !ok {
			h.DB.Exec(`DELETE FROM fish WHERE id = $1`, fishID)
		}
	}()

	// Save files named by fish ID
	ext := ".jpg"
	if header != nil && header.Filename != "" {
		if e := filepath.Ext(header.Filename); e != "" {
			ext = e
		}
	}

	filename := fmt.Sprintf("%d%s", fishID, ext)
	thumbFilename := fmt.Sprintf("%d_thumb%s", fishID, ext)

	photoPath := filepath.Join(h.Cfg.PhotoDir, filename)
	thumbPath := filepath.Join(h.Cfg.PhotoDir, thumbFilename)

	// Save full photo
	fullOut, err := os.Create(photoPath)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	defer fullOut.Close()
	if err := imaging.Encode(fullOut, resized, imaging.JPEG, imaging.JPEGQuality(85)); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Save thumbnail
	thumbOut, err := os.Create(thumbPath)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	defer thumbOut.Close()
	if err := imaging.Encode(thumbOut, thumb, imaging.JPEG, imaging.JPEGQuality(80)); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Update photo_filename in DB
	if _, err := h.DB.Exec(`UPDATE fish SET photo_filename = $1 WHERE id = $2`, filename, fishID); err != nil {
		log.Printf("[FISH] ERROR updating photo_filename for id=%d: %v", fishID, err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	ok = true // everything succeeded, don't clean up

	// Return created fish
	f := models.Fish{
		ID:            fishID,
		PhotoFilename: filename,
		Latitude:      lat,
		Longitude:     lng,
		AddressHint:   addressHint,
		SpottedBy:     userID,
		CreatedAt:     time.Now(),
	}
	log.Printf("[FISH] type=created id=%d user_id=%d lat=%.5f lng=%.5f addr=%q",
		f.ID, userID, lat, lng, addressHint)

	writeJSON(w, http.StatusCreated, f)
}

func (h *FishHandler) List(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 50
	}
	offset := (page - 1) * limit

	rows, err := h.DB.Query(
		`SELECT f.id, f.photo_filename, f.latitude, f.longitude, f.address_hint,
		        f.spotted_by, u.username, f.created_at
		 FROM fish f
		 JOIN users u ON u.id = f.spotted_by
		 ORDER BY f.created_at DESC
		 LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		log.Printf("[FISH] List query error: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	fishList := []models.Fish{}
	for rows.Next() {
		var f models.Fish
		if err := rows.Scan(&f.ID, &f.PhotoFilename, &f.Latitude, &f.Longitude,
			&f.AddressHint, &f.SpottedBy, &f.SpotterName, &f.CreatedAt); err != nil {
			log.Printf("[FISH] List scan error: %v", err)
			continue
		}
		if math.IsNaN(f.Latitude) || math.IsNaN(f.Longitude) {
			log.Printf("[FISH] List skipping fish %d with NaN coords", f.ID)
			continue
		}
		fishList = append(fishList, f)
	}
	if err := rows.Err(); err != nil {
		log.Printf("[FISH] List rows error: %v", err)
	}

	writeJSON(w, http.StatusOK, fishList)
}

func (h *FishHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid fish id"}`, http.StatusBadRequest)
		return
	}

	var f models.Fish
	err = h.DB.QueryRow(
		`SELECT f.id, f.photo_filename, f.latitude, f.longitude, f.address_hint,
		        f.spotted_by, u.username, f.created_at
		 FROM fish f
		 JOIN users u ON u.id = f.spotted_by
		 WHERE f.id = $1`, id,
	).Scan(&f.ID, &f.PhotoFilename, &f.Latitude, &f.Longitude,
		&f.AddressHint, &f.SpottedBy, &f.SpotterName, &f.CreatedAt)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"fish not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Get collectors
	rows, err := h.DB.Query(
		`SELECT u.username, c.created_at FROM collections c
		 JOIN users u ON u.id = c.user_id
		 WHERE c.fish_id = $1
		 ORDER BY c.created_at ASC`, id,
	)
	collectors := []models.CollectorEntry{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ce models.CollectorEntry
			if err := rows.Scan(&ce.Username, &ce.CollectedAt); err == nil {
				collectors = append(collectors, ce)
			}
		}
	}

	detail := models.FishDetail{
		Fish:       f,
		Collectors: collectors,
	}
	writeJSON(w, http.StatusOK, detail)
}

func (h *FishHandler) Nearby(w http.ResponseWriter, r *http.Request) {
	latStr := r.URL.Query().Get("lat")
	lngStr := r.URL.Query().Get("lng")
	radiusStr := r.URL.Query().Get("radius_m")

	lat, err := strconv.ParseFloat(latStr, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid lat"}`, http.StatusBadRequest)
		return
	}
	lng, err := strconv.ParseFloat(lngStr, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid lng"}`, http.StatusBadRequest)
		return
	}
	radius := h.Cfg.NearbyRadiusMeters
	if radiusStr != "" {
		if r, err := strconv.ParseFloat(radiusStr, 64); err == nil && r > 0 {
			radius = r
		}
	}

	// Haversine formula for distance calculation (no PostGIS extensions needed)
	// Approx: 1° lat = 111320m, 1° lng = 111320*cos(lat) at given latitude
	// Bounding box pre-filter for performance, then haversine in SQL
	rows, err := h.DB.Query(
		`SELECT f.id, f.photo_filename, f.latitude, f.longitude, f.address_hint,
		        f.spotted_by, u.username, f.created_at,
		        2 * 6371000 * asin(sqrt(
		          pow(sin(radians(f.latitude  - $1) / 2), 2)
		        + cos(radians($1)) * cos(radians(f.latitude)) * pow(sin(radians(f.longitude - $2) / 2), 2)
		        )) AS distance
		 FROM fish f
		 JOIN users u ON u.id = f.spotted_by
		 WHERE f.latitude  BETWEEN $1 - ($3 / 111320.0)
		                   AND $1 + ($3 / 111320.0)
		   AND f.longitude BETWEEN $2 - ($3 / (111320.0 * cos(radians($1))))
		                   AND $2 + ($3 / (111320.0 * cos(radians($1))))
		   AND 2 * 6371000 * asin(sqrt(
		          pow(sin(radians(f.latitude  - $1) / 2), 2)
		        + cos(radians($1)) * cos(radians(f.latitude)) * pow(sin(radians(f.longitude - $2) / 2), 2)
		        )) < $3
		 ORDER BY distance ASC
		 LIMIT 20`, lat, lng, radius,
	)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	nearby := []models.NearbyFish{}
	for rows.Next() {
		var nf models.NearbyFish
		if err := rows.Scan(&nf.ID, &nf.PhotoFilename, &nf.Latitude, &nf.Longitude,
			&nf.AddressHint, &nf.SpottedBy, &nf.SpotterName, &nf.CreatedAt,
			&nf.DistanceMeters); err != nil {
			continue
		}
		nf.DistanceMeters = math.Round(nf.DistanceMeters*100) / 100
		nearby = append(nearby, nf)
	}

	writeJSON(w, http.StatusOK, nearby)
}

func (h *FishHandler) Config(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{
		"allow_gallery_upload": h.Cfg.AllowGalleryUpload(),
	})
}

// DeleteMyFish deletes a fish entry by ID. Only the original spotter can delete it.
func (h *FishHandler) DeleteMyFish(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.ContextUserID).(int)
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid fish id"}`, http.StatusBadRequest)
		return
	}

	// Check ownership
	var spottedBy int
	err = h.DB.QueryRow(`SELECT spotted_by FROM fish WHERE id = $1`, id).Scan(&spottedBy)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"fish not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if spottedBy != userID {
		http.Error(w, `{"error":"you can only delete your own spots"}`, http.StatusForbidden)
		return
	}

	// Get photo filename before deleting
	var filename string
	h.DB.QueryRow(`SELECT photo_filename FROM fish WHERE id = $1`, id).Scan(&filename)

	// Delete from DB
	_, err = h.DB.Exec(`DELETE FROM fish WHERE id = $1`, id)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Delete photo files
	if filename != "" {
		ext := filepath.Ext(filename)
		baseName := filename[:len(filename)-len(ext)]
		photoPath := filepath.Join(h.Cfg.PhotoDir, filename)
		thumbPath := filepath.Join(h.Cfg.PhotoDir, baseName+"_thumb"+ext)
		os.Remove(photoPath)
		os.Remove(thumbPath)
	}

	log.Printf("[FISH] type=deleted_by_owner fish_id=%d user_id=%d", id, userID)
	writeJSON(w, http.StatusOK, map[string]string{"message": "fish deleted"})
}

// ServePhoto serves a photo or thumbnail from the photo directory.
func (h *FishHandler) ServePhoto(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "filename")
	if filename == "" || strings.Contains(filename, "..") || strings.Contains(filename, "/") {
		http.Error(w, "invalid filename", http.StatusBadRequest)
		return
	}

	photoPath := filepath.Join(h.Cfg.PhotoDir, filename)
	if _, err := os.Stat(photoPath); os.IsNotExist(err) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, photoPath)
}

