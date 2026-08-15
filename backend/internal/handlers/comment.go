package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"rybaspotting/internal/config"
	"rybaspotting/internal/middleware"
	"rybaspotting/internal/models"
	"rybaspotting/internal/notify"

	"github.com/go-chi/chi/v5"
)

// CommentHandler handles fish comments: create, list per fish, recent wall,
// and delete (own comment or admin).
type CommentHandler struct {
	DB     *sql.DB
	Cfg    *config.Config
	Notify *notify.Notifier
}

type createCommentRequest struct {
	Body string `json:"body"`
}

// Create adds a comment to a fish.
//
// Safety / abuse controls:
//   - fish must exist
//   - body is sanitized to plain text (control chars stripped, trimmed, rune-capped)
//     so it can never carry stored XSS — the frontend renders body as text only
//   - per-user rolling 24h rate limit (cfg.MaxCommentsPerDay, default 1000)
//   - per-comment length limit (cfg.MaxCommentLength, default 2000 runes)
func (h *CommentHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.ContextUserID).(int)
	isAdmin, _ := r.Context().Value(middleware.ContextIsAdmin).(bool)

	fishIDStr := chi.URLParam(r, "id")
	fishID, err := strconv.Atoi(fishIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid fish id"}`, http.StatusBadRequest)
		return
	}

	// Fish must exist
	var exists bool
	if err := h.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM fish WHERE id = $1)`, fishID).Scan(&exists); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if !exists {
		http.Error(w, `{"error":"fish not found"}`, http.StatusNotFound)
		return
	}

	var req createCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	maxLen := h.Cfg.MaxCommentLength
	if maxLen <= 0 {
		maxLen = 2000
	}
	body := sanitizeComment(req.Body, maxLen)
	if body == "" {
		http.Error(w, `{"error":"komentarz nie może być pusty"}`, http.StatusBadRequest)
		return
	}

	// Per-user daily rate limit. Admins bypass, so a moderator can clean up
	// a spam wave without being throttled.
	if !isAdmin {
		var todayCount int
		if err := h.DB.QueryRow(
			`SELECT COUNT(*) FROM comments WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
			userID,
		).Scan(&todayCount); err != nil {
			log.Printf("[COMMENT] daily-quota count error user_id=%d: %v", userID, err)
			// Fail open — a DB hiccup shouldn't lock out real comments.
		} else if todayCount >= h.Cfg.MaxCommentsPerDay {
			log.Printf("[COMMENT] daily-quota hit user_id=%d count=%d limit=%d",
				userID, todayCount, h.Cfg.MaxCommentsPerDay)
			w.Header().Set("Retry-After", "3600")
			http.Error(w, `{"error":"limit komentarzy osiągnięty — spróbuj jutro"}`,
				http.StatusTooManyRequests)
			return
		}
	}

	var c models.Comment
	err = h.DB.QueryRow(
		`INSERT INTO comments (fish_id, user_id, body)
		 VALUES ($1, $2, $3)
		 RETURNING id, fish_id, user_id, body, created_at`,
		fishID, userID, body,
	).Scan(&c.ID, &c.FishID, &c.UserID, &c.Body, &c.CreatedAt)
	if err != nil {
		log.Printf("[COMMENT] insert error user_id=%d fish_id=%d: %v", userID, fishID, err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Resolve display name for the response
	err = h.DB.QueryRow(
		`SELECT COALESCE(NULLIF(display_name, ''), username) FROM users WHERE id = $1`, userID,
	).Scan(&c.Username)
	if err != nil {
		c.Username = ""
	}

	log.Printf("[COMMENT] type=created comment_id=%d user_id=%d fish_id=%d len=%d",
		c.ID, userID, fishID, utf8.RuneCountInString(c.Body))

	// Push notification for the key event: a new comment was posted.
	if h.Notify != nil {
		h.Notify.CommentAdded(c.Username, fishID, c.Body)
	}

	writeJSON(w, http.StatusCreated, c)
}

// List returns all comments for a fish, oldest first (capped to last 200).
func (h *CommentHandler) List(w http.ResponseWriter, r *http.Request) {
	fishIDStr := chi.URLParam(r, "id")
	fishID, err := strconv.Atoi(fishIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid fish id"}`, http.StatusBadRequest)
		return
	}

	rows, err := h.DB.Query(
		`SELECT c.id, c.fish_id, c.user_id,
		        COALESCE(NULLIF(u.display_name, ''), u.username),
		        c.body, c.created_at
		 FROM comments c
		 JOIN users u ON u.id = c.user_id
		 WHERE c.fish_id = $1
		 ORDER BY c.created_at ASC
		 LIMIT 200`, fishID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	comments := []models.Comment{}
	for rows.Next() {
		var c models.Comment
		if err := rows.Scan(&c.ID, &c.FishID, &c.UserID, &c.Username, &c.Body, &c.CreatedAt); err != nil {
			continue
		}
		comments = append(comments, c)
	}

	writeJSON(w, http.StatusOK, comments)
}

// Recent returns the latest comments across all fish — the "wall" view.
// Each entry carries the fish's coordinates + photo so the client can fly to
// it on the map when tapped. Public endpoint.
func (h *CommentHandler) Recent(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 200 {
		limit = 50
	}

	rows, err := h.DB.Query(
		`SELECT c.id, c.fish_id, c.user_id,
		        COALESCE(NULLIF(cu.display_name, ''), cu.username),
		        c.body, c.created_at,
		        f.photo_filename, f.latitude, f.longitude, f.address_hint,
		        COALESCE(NULLIF(su.display_name, ''), su.username)
		 FROM comments c
		 JOIN users cu ON cu.id = c.user_id
		 JOIN fish f  ON f.id = c.fish_id
		 JOIN users su ON su.id = f.spotted_by
		 ORDER BY c.created_at DESC
		 LIMIT $1`, limit)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := []models.WallComment{}
	for rows.Next() {
		var wc models.WallComment
		if err := rows.Scan(
			&wc.ID, &wc.FishID, &wc.UserID, &wc.Username, &wc.Body, &wc.CreatedAt,
			&wc.PhotoFilename, &wc.Latitude, &wc.Longitude, &wc.AddressHint, &wc.SpotterName,
		); err != nil {
			continue
		}
		result = append(result, wc)
	}

	writeJSON(w, http.StatusOK, result)
}

// Delete removes a comment. The author may delete their own comment; admins may
// delete any comment (moderation).
func (h *CommentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.ContextUserID).(int)
	isAdmin, _ := r.Context().Value(middleware.ContextIsAdmin).(bool)

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid comment id"}`, http.StatusBadRequest)
		return
	}

	var authorID int
	err = h.DB.QueryRow(`SELECT user_id FROM comments WHERE id = $1`, id).Scan(&authorID)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"comment not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	if authorID != userID && !isAdmin {
		http.Error(w, `{"error":"możesz usuwać tylko swoje komentarze"}`, http.StatusForbidden)
		return
	}

	if _, err := h.DB.Exec(`DELETE FROM comments WHERE id = $1`, id); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	log.Printf("[COMMENT] type=deleted comment_id=%d by_user_id=%d admin=%v", id, userID, isAdmin)
	writeJSON(w, http.StatusOK, map[string]string{"message": "comment deleted"})
}

// sanitizeComment normalizes a comment body for safe storage as plain text.
//
// It trims surrounding whitespace, collapses runs of whitespace (incl. newlines)
// into single spaces, replaces control / non-printable characters with spaces,
// and enforces a max UTF-8 rune count. Returns "" if nothing meaningful remains.
//
// Because the body is stored verbatim after this normalization and the frontend
// renders it via JSX text interpolation (never innerHTML / dangerouslySetInnerHTML),
// there is no path to stored XSS — raw HTML survives as inert text.
func sanitizeComment(raw string, maxLen int) string {
	if maxLen <= 0 {
		maxLen = 2000
	}
	if utf8.RuneCountInString(raw) > maxLen {
		raw = string([]rune(raw)[:maxLen])
	}

	var b strings.Builder
	b.Grow(len(raw))
	prevSpace := true // leading-space suppression
	for _, r := range raw {
		switch {
		case r == '\n' || r == '\r' || r == '\t' || r == ' ' || r == '\u00a0':
			if !prevSpace {
				b.WriteRune(' ')
				prevSpace = true
			}
		case unicode.IsControl(r) || r == '\u0000':
			if !prevSpace {
				b.WriteRune(' ')
				prevSpace = true
			}
		case !unicode.IsPrint(r):
			// Drop other non-printable runes entirely (e.g. format chars, BOM).
			if !prevSpace {
				b.WriteRune(' ')
				prevSpace = true
			}
		default:
			b.WriteRune(r)
			prevSpace = false
		}
	}
	return strings.TrimSpace(b.String())
}