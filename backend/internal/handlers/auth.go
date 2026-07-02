package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"rybaspotting/internal/config"
	"rybaspotting/internal/middleware"

	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

type registerRequest struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authResponse struct {
	Token       string `json:"token"`
	UserID      int    `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	IsActive    bool   `json:"is_active"`
	IsAdmin     bool   `json:"is_admin"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Username == "" || req.Password == "" {
		http.Error(w, `{"error":"username and password required"}`, http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	var userID int
	err = h.DB.QueryRow(
		`INSERT INTO users (username, password_hash, display_name, is_active) VALUES ($1, $2, $3, false) RETURNING id`,
		req.Username, string(hash), req.DisplayName,
	).Scan(&userID)
	if err != nil {
		// Check for duplicate username
		if isPGUniqueViolation(err) {
			http.Error(w, `{"error":"username already taken"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"message": "registration successful, awaiting admin approval",
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	var userID int
	var username, displayName, passwordHash string
	var isActive, isAdmin bool

	err := h.DB.QueryRow(
		`SELECT id, username, display_name, password_hash, is_active, is_admin FROM users WHERE username = $1`,
		req.Username,
	).Scan(&userID, &username, &displayName, &passwordHash, &isActive, &isAdmin)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
		return
	}

	token, err := middleware.GenerateToken(h.Cfg, userID, isActive, isAdmin)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, authResponse{
		Token:       token,
		UserID:      userID,
		Username:    username,
		DisplayName: displayName,
		IsActive:    isActive,
		IsAdmin:     isAdmin,
	})
}
