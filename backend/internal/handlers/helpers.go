package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-cache")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("[JSON] encode error: %v", err)
	}
}

// isPGUniqueViolation checks if a PostgreSQL error is a unique constraint violation (code 23505).
func isPGUniqueViolation(err error) bool {
	return strings.Contains(err.Error(), "23505")
}
