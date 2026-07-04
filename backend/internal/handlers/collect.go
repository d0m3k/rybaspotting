package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"strconv"

	"rybaspotting/internal/middleware"

	"github.com/go-chi/chi/v5"
)

type CollectHandler struct {
	DB *sql.DB
}

func (h *CollectHandler) Collect(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.ContextUserID).(int)
	fishIDStr := chi.URLParam(r, "id")
	fishID, err := strconv.Atoi(fishIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid fish id"}`, http.StatusBadRequest)
		return
	}

	// Check fish exists
	var exists bool
	h.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM fish WHERE id = $1)`, fishID).Scan(&exists)
	if !exists {
		http.Error(w, `{"error":"fish not found"}`, http.StatusNotFound)
		return
	}

	// Can't collect your own spot
	var spottedBy int
	h.DB.QueryRow(`SELECT spotted_by FROM fish WHERE id = $1`, fishID).Scan(&spottedBy)
	if spottedBy == userID {
		http.Error(w, `{"error":"nie możesz zebrać własnej ryby"}`, http.StatusForbidden)
		return
	}

	result, err := h.DB.Exec(
		`INSERT INTO collections (fish_id, user_id) VALUES ($1, $2) ON CONFLICT (fish_id, user_id) DO NOTHING`,
		fishID, userID,
	)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Check if row already existed (ON CONFLICT DO NOTHING = 0 rows affected)
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, `{"error":"już zebrałeś tę rybę"}`, http.StatusConflict)
		return
	}

	// Get spotter name for the log
	var spotterName string
	h.DB.QueryRow(`SELECT u.username FROM fish f JOIN users u ON u.id = f.spotted_by WHERE f.id = $1`, fishID).Scan(&spotterName)

	log.Printf("[FISH] type=collected fish_id=%d user_id=%d spotter=%s", fishID, userID, spotterName)

	writeJSON(w, http.StatusOK, map[string]string{"message": "collected"})
}

func (h *CollectHandler) Uncollect(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.ContextUserID).(int)
	fishIDStr := chi.URLParam(r, "id")
	fishID, err := strconv.Atoi(fishIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid fish id"}`, http.StatusBadRequest)
		return
	}

	res, err := h.DB.Exec(
		`DELETE FROM collections WHERE fish_id = $1 AND user_id = $2`,
		fishID, userID,
	)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		http.Error(w, `{"error":"collection not found"}`, http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "uncollected"})
}
