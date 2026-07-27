package models

import "time"

// Comment is a plain-text remark left on a fish spot.
type Comment struct {
	ID        int       `json:"id"`
	FishID    int       `json:"fish_id"`
	UserID    int       `json:"user_id"`
	Username  string    `json:"username"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

// WallComment is a comment joined with enough fish info to locate it on the
// map (so the "wall" view can fly to the fish when tapped).
type WallComment struct {
	Comment
	PhotoFilename string  `json:"photo_filename"`
	PhotoURL      string  `json:"photo_url,omitempty"`
	Latitude      float64 `json:"latitude"`
	Longitude     float64 `json:"longitude"`
	AddressHint   string  `json:"address_hint"`
	SpotterName   string  `json:"spotter_name"`
}