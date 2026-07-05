package handlers

import (
	"database/sql"
	"net/http"

	"rybaspotting/internal/models"
)

type LeaderboardHandler struct {
	DB *sql.DB
}

func (h *LeaderboardHandler) Get(w http.ResponseWriter, r *http.Request) {
	lb := models.Leaderboard{
		TopSpotters:   make([]models.LeaderboardEntry, 0),
		TopCollectors: make([]models.LeaderboardEntry, 0),
	}

	// Top spotters
	rows, err := h.DB.Query(
		`SELECT u.id, u.username, COUNT(f.id) AS count
		 FROM users u
		 JOIN fish f ON f.spotted_by = u.id
		 GROUP BY u.id, u.username
		 ORDER BY count DESC
		 LIMIT 50`,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var e models.LeaderboardEntry
			if err := rows.Scan(&e.UserID, &e.Username, &e.Count); err == nil {
				lb.TopSpotters = append(lb.TopSpotters, e)
			}
		}
	}

	// Top collectors
	rows2, err := h.DB.Query(
		`SELECT u.id, u.username, COUNT(c.id) AS count
		 FROM users u
		 JOIN collections c ON c.user_id = u.id
		 GROUP BY u.id, u.username
		 ORDER BY count DESC
		 LIMIT 50`,
	)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var e models.LeaderboardEntry
			if err := rows2.Scan(&e.UserID, &e.Username, &e.Count); err == nil {
				lb.TopCollectors = append(lb.TopCollectors, e)
			}
		}
	}

	writeJSON(w, http.StatusOK, lb)
}
