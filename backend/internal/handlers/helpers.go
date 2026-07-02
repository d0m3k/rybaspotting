package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
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
