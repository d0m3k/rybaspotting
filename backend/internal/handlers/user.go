package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"rybaspotting/internal/middleware"
)

type UserHandler struct {
	DB *sql.DB
}

type userStatsResponse struct {
	UserID      int    `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	IsAdmin     bool   `json:"is_admin"`
	Spotted     int    `json:"spotted"`
	Collected   int    `json:"collected"`
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

	writeJSON(w, http.StatusOK, resp)
}

// MyCollections returns fish that the authenticated user has collected.
func (h *UserHandler) MyCollections(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.ContextUserID).(int)

	rows, err := h.DB.Query(
		`SELECT f.id, f.photo_filename, f.latitude, f.longitude, f.address_hint,
		        u.username, f.created_at, c.created_at
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
