// Package notify sends Pushover push notifications for key app events.
//
// It is fully optional: when Pushover isn't configured (see New) every method
// is a silent no-op, so the app behaves exactly as before. Configuration is
// read from the environment in internal/config (PUSHOVER_USER_KEY +
// PUSHOVER_APP_TOKEN) and the notifier is created once at startup.
package notify

import (
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Notifier delivers push notifications to the configured Pushover user.
type Notifier struct {
	userKey  string
	appToken string
	baseURL  string
	client   *http.Client
}

// New returns a ready-to-use Notifier, or nil when Pushover is not configured.
// Pushover requires BOTH:
//   - userKey:   your personal user key (pushover.net → Your User Key)
//   - appToken:  an application token (pushover.net → Your Applications →
//                Create an Application)
//
// baseURL is used as the tap-through link inside notifications (the app's
// public origin, e.g. https://ryby.dom3k.pl).
func New(userKey, appToken, baseURL string) *Notifier {
	userKey = strings.TrimSpace(userKey)
	appToken = strings.TrimSpace(appToken)
	if userKey == "" || appToken == "" {
		return nil
	}
	return &Notifier{
		userKey:  userKey,
		appToken: appToken,
		baseURL:  strings.TrimRight(baseURL, "/"),
		client:   &http.Client{Timeout: 10 * time.Second},
	}
}

// Enabled reports whether Pushover notifications are active (both keys set).
func (n *Notifier) Enabled() bool { return n != nil }

// FishSpotted notifies about a newly uploaded fish spot.
func (n *Notifier) FishSpotted(spotter, address string, fishID int, lat, lng float64) {
	if n == nil {
		return
	}
	msg := fmt.Sprintf("%s oznaczył nową rybę 🐟", spotter)
	if address != "" {
		msg += fmt.Sprintf(" przy %s", address)
	}
	msg += fmt.Sprintf("\n📍 %.5f, %.5f", lat, lng)
	n.send("Nowa ryba z dupom!", msg)
}

// UserRegistered notifies about a new account.
func (n *Notifier) UserRegistered(username string) {
	if n == nil {
		return
	}
	n.send("Nowy użytkownik 👤", fmt.Sprintf("Zarejestrował się: %s", username))
}

// CommentAdded notifies about a new comment on a fish.
func (n *Notifier) CommentAdded(username string, fishID int, body string) {
	if n == nil {
		return
	}
	body = strings.TrimSpace(body)
	if r := []rune(body); len(r) > 140 {
		body = string(r[:140]) + "…"
	}
	n.send("Nowy komentarz 💬", fmt.Sprintf("%s na rybie #%d:\n%s", username, fishID, body))
}

// FishCollected notifies about a fish being collected by another user.
func (n *Notifier) FishCollected(collector string, fishID int, address string) {
	if n == nil {
		return
	}
	msg := fmt.Sprintf("%s zebrał rybę #%d ✅", collector, fishID)
	if address != "" {
		msg += fmt.Sprintf(" (%s)", address)
	}
	n.send("Ryba zebrana!", msg)
}

// send pushes a message asynchronously so it never blocks the HTTP request.
// Failures are logged and swallowed — a notification hiccup must not break a
// successful API response.
func (n *Notifier) send(title, message string) {
	go func() {
		form := url.Values{}
		form.Set("token", n.appToken)
		form.Set("user", n.userKey)
		form.Set("title", truncateRunes(title, 100))
		form.Set("message", truncateRunes(message, 1024))
		if n.baseURL != "" {
			form.Set("url", n.baseURL)
			form.Set("url_title", "Otwórz Rybaspotting")
		}

		resp, err := n.client.PostForm("https://api.pushover.net/1/messages.json", form)
		if err != nil {
			log.Printf("[NOTIFY] pushover send error: %v", err)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			log.Printf("[NOTIFY] pushover rejected: status=%d (check PUSHOVER_USER_KEY / PUSHOVER_APP_TOKEN)", resp.StatusCode)
			return
		}
		log.Printf("[NOTIFY] sent title=%q", title)
	}()
}

func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
