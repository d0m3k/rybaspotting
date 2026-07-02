package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"rybaspotting/internal/config"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const (
	ContextUserID   contextKey = "user_id"
	ContextIsActive contextKey = "is_active"
	ContextIsAdmin  contextKey = "is_admin"
)

// AuthMiddleware returns an HTTP middleware that validates JWT tokens.
// It injects user_id, is_active, is_admin into the request context.
func AuthMiddleware(cfg *config.Config) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
				return
			}

			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			if tokenStr == authHeader {
				http.Error(w, `{"error":"invalid authorization format"}`, http.StatusUnauthorized)
				return
			}

			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
				}
				return []byte(cfg.JWTSecret), nil
			})
			if err != nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok || !token.Valid {
				http.Error(w, `{"error":"invalid token claims"}`, http.StatusUnauthorized)
				return
			}

			// Extract claims
			userID := int(claims["user_id"].(float64))
			isActive := claims["is_active"].(bool)
			isAdmin := claims["is_admin"].(bool)

			ctx := context.WithValue(r.Context(), ContextUserID, userID)
			ctx = context.WithValue(ctx, ContextIsActive, isActive)
			ctx = context.WithValue(ctx, ContextIsAdmin, isAdmin)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireActive returns middleware that rejects inactive users.
func RequireActive(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		isActive, _ := r.Context().Value(ContextIsActive).(bool)
		if !isActive {
			http.Error(w, `{"error":"account not yet approved"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// GenerateToken creates a JWT token for the given user.
func GenerateToken(cfg *config.Config, userID int, isActive, isAdmin bool) (string, error) {
	claims := jwt.MapClaims{
		"user_id":   userID,
		"is_active": isActive,
		"is_admin":  isAdmin,
		"iat":       time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWTSecret))
}
