package handlers

import (
	"database/sql"
	"net/http"

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
