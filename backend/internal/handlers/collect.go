package handlers

import (
	"database/sql"
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

	// Can't collect your own spot (optional rule, but let's allow it for now)
	// Actually the requirement says "joining the list of people that met this ryba later"
	// so the spotter can also collect? Let's allow it.

	_, err = h.DB.Exec(
		`INSERT INTO collections (fish_id, user_id) VALUES ($1, $2) ON CONFLICT (fish_id, user_id) DO NOTHING`,
		fishID, userID,
	)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Check if already existed
	var count int
	h.DB.QueryRow(`SELECT COUNT(*) FROM collections WHERE fish_id = $1 AND user_id = $2`, fishID, userID).Scan(&count)

	if count == 0 {
		http.Error(w, `{"error":"already collected"}`, http.StatusConflict)
		return
	}

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
