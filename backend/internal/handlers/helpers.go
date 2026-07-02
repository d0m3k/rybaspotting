package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"rybaspotting/internal/config"
)

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// isPGUniqueViolation checks if a PostgreSQL error is a unique constraint violation (code 23505).
func isPGUniqueViolation(err error) bool {
	return strings.Contains(err.Error(), "23505")
}

// checkAdminToken validates the X-Admin-Token header and writes a 403 error if invalid.
// Returns true if the token is valid.
func checkAdminToken(w http.ResponseWriter, r *http.Request, cfg *config.Config) bool {
	token := r.Header.Get("X-Admin-Token")
	if token == "" || token != cfg.AdminToken {
		http.Error(w, `{"error":"invalid admin token"}`, http.StatusForbidden)
		return false
	}
	return true
}
