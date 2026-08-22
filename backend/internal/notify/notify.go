// Package notify sends Pushover push notifications for key app events.
//
// It is fully optional: when Pushover isn't configured (see New) every method
// is a silent no-op, so the app behaves exactly as before. Configuration is
// read from the environment in internal/config (PUSHOVER_USER_KEY +
// PUSHOVER_APP_TOKEN) and the notifier is created once at startup.
//
// Two notification tiers:
//   - regular events (new fish, registration, comment, collection) — normal
//     priority, default sound;
//   - admin alerts (quota hits, spam waves, brute-force attempts) — priority 1
//     (bypasses quiet hours) with a distinct "siren" sound, and burst detection
//     with a cooldown so a wave triggers one alert instead of one per event.
package notify

import (
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// burst thresholds / windows for admin alerts. Sensible defaults; a real spam
// wave will comfortably exceed these.
const (
	burstWindow      = 10 * time.Minute
	burstCooldown    = 30 * time.Minute
	regBurstCount    = 5  // new accounts within burstWindow
	loginBurstCount  = 5  // failed logins for one username within burstWindow
	commentBurstCnt  = 15 // comments from one user within burstWindow
)

// Notifier delivers push notifications to the configured Pushover user.
type Notifier struct {
	userKey  string
	appToken string
	baseURL  string
	client   *http.Client
	policy   *alertPolicy
}

// New returns a ready-to-use Notifier, or nil when Pushover is not configured.
// Pushover requires BOTH:
//   - userKey:   your personal user key (pushover.net → Your User Key)
//   - appToken:  an application token (pushover.net → Your Applications →
//                Create an Application)
//
// baseURL is the app's public origin (e.g. https://ryby.dom3k.pl). For events
// tied to a specific spot it gets combined with the hash route (#/fish/{id})
// so tapping the notification opens that exact fish on the map; other events
// fall back to the app home.
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
		policy:   newAlertPolicy(burstWindow, burstCooldown),
	}
}

// Enabled reports whether Pushover notifications are active (both keys set).
func (n *Notifier) Enabled() bool { return n != nil }

// ── Regular event notifications ─────────────────────────────────────────

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
	n.post("Nowa ryba z dupom!", msg, 0, "", n.fishLink(fishID), "Pokaż rybę 🐟")
}

// UserRegistered notifies about a new account. No fish to link to — the
// notification falls back to the app home.
func (n *Notifier) UserRegistered(username string) {
	if n == nil {
		return
	}
	n.post("Nowy użytkownik 👤", fmt.Sprintf("Zarejestrował się: %s", username), 0, "", "", "")
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
	n.post("Nowy komentarz 💬", fmt.Sprintf("%s na rybie #%d:\n%s", username, fishID, body), 0, "", n.fishLink(fishID), "Pokaż rybę 💬")
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
	n.post("Ryba zebrana!", msg, 0, "", n.fishLink(fishID), "Pokaż rybę ✅")
}

// ── Admin alerts (priority 1, siren) ────────────────────────────────────

// QuotaHit alerts about a user hitting their daily upload/comment cap — a
// classic bot/spam signal. kind is the human-readable activity, e.g. "ryb".
func (n *Notifier) QuotaHit(kind, username string, count, limit int) {
	if n == nil {
		return
	}
	if username == "" {
		username = "(nieznany)"
	}
	n.sendAdmin("🚨 Przekroczony limit!",
		fmt.Sprintf("Użytkownik %s przekroczył dzienny limit %s: %d/%d. Prawdopodobnie bot/spam.",
			username, kind, count, limit))
}

// RegistrationBurst alerts when many new accounts are created in a short
// window — a signup-spam wave. Call on every successful registration; the
// burst detector decides when to actually alert.
func (n *Notifier) RegistrationBurst() {
	if n == nil {
		return
	}
	if n.policy.observe("registrations", regBurstCount) {
		n.sendAdmin("🚨 Fala rejestracji!",
			fmt.Sprintf("%d+ nowych kont w %d minut — możliwa fala spamu.",
				regBurstCount, int(burstWindow.Minutes())))
	}
}

// FailedLogin tracks failed logins per username and alerts on a likely
// brute-force attempt. Call on every failed login.
func (n *Notifier) FailedLogin(username string) {
	if n == nil {
		return
	}
	if n.policy.observe("login:"+username, loginBurstCount) {
		n.sendAdmin("🚨 Atak brute-force?",
			fmt.Sprintf("%d+ nieudanych logowań na konto „%s” w %d minut.",
				loginBurstCount, username, int(burstWindow.Minutes())))
	}
}

// CommentBurst alerts when a single user posts many comments in a short
// window — comment-spam signal. Call on every new comment.
func (n *Notifier) CommentBurst(username string) {
	if n == nil {
		return
	}
	if username == "" {
		username = "(nieznany)"
	}
	if n.policy.observe("comments:"+username, commentBurstCnt) {
		n.sendAdmin("🚨 Burza komentarzy!",
			fmt.Sprintf("%s dodał %d+ komentarzy w %d minut.",
				username, commentBurstCnt, int(burstWindow.Minutes())))
	}
}

// sendAdmin pushes a high-priority alert: bypasses quiet hours, distinct sound.
// No specific fish to link to — the tap-through defaults to the app home.
func (n *Notifier) sendAdmin(title, message string) {
	n.post(title, message, 1, "siren", "", "")
}

// ── transport ───────────────────────────────────────────────────────────

// fishLink builds a deep link to one fish using the hash router added in
// frontend/src/router.ts: {baseURL}#/fish/{id}. The hash survives PWA
// navigation, so tapping the notification opens the map centred on that spot.
func (n *Notifier) fishLink(id int) string {
	if n.baseURL == "" || id <= 0 {
		return ""
	}
	return fmt.Sprintf("%s#/fish/%d", n.baseURL, id)
}

// post pushes a message asynchronously so it never blocks the HTTP request.
// Failures are logged and swallowed — a notification hiccup must not break a
// successful API response.
//
// link/linkTitle make the notification tappable (Pushover supports one link).
// When link is empty it defaults to the app home so a notification never ends
// up with a dead tap.
func (n *Notifier) post(title, message string, priority int, sound, link, linkTitle string) {
	go func() {
		form := url.Values{}
		form.Set("token", n.appToken)
		form.Set("user", n.userKey)
		form.Set("title", truncateRunes(title, 100))
		form.Set("message", truncateRunes(message, 1024))
		if priority != 0 {
			form.Set("priority", fmt.Sprintf("%d", priority))
		}
		if sound != "" {
			form.Set("sound", sound)
		}
		if link == "" {
			link, linkTitle = n.baseURL, "Otwórz Rybaspotting"
		}
		if link != "" {
			form.Set("url", link)
			form.Set("url_title", linkTitle)
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
		log.Printf("[NOTIFY] sent title=%q priority=%d", title, priority)
	}()
}

func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}

// ── burst detector ──────────────────────────────────────────────────────

// alertPolicy tracks event counts per key within a rolling window and reports
// when a threshold is crossed, with a per-key cooldown between alerts so a
// spam wave produces one alert instead of dozens.
type alertPolicy struct {
	mu        sync.Mutex
	window    time.Duration
	cooldown  time.Duration
	events    map[string][]time.Time
	lastAlert map[string]time.Time
}

func newAlertPolicy(window, cooldown time.Duration) *alertPolicy {
	return &alertPolicy{
		window:    window,
		cooldown:  cooldown,
		events:    make(map[string][]time.Time),
		lastAlert: make(map[string]time.Time),
	}
}

// observe records an event for key and reports whether an alert should fire:
// the event count within the window reached threshold AND the cooldown since
// the previous alert for this key has elapsed.
func (a *alertPolicy) observe(key string, threshold int) bool {
	a.mu.Lock()
	defer a.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-a.window)
	ev := a.events[key]
	kept := ev[:0]
	for _, t := range ev {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	kept = append(kept, now)
	a.events[key] = kept

	if len(kept) < threshold {
		return false
	}
	if last, ok := a.lastAlert[key]; ok && now.Sub(last) < a.cooldown {
		return false
	}
	a.lastAlert[key] = now
	return true
}
