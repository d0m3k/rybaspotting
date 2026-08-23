package models

import "time"

type Collection struct {
	ID        int       `json:"id"`
	FishID    int       `json:"fish_id"`
	UserID    int       `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

type AdminCollectionEntry struct {
	ID           int       `json:"id"`
	FishID       int       `json:"fish_id"`
	CollectorName string   `json:"collector_name"`
	SpotterName  string    `json:"spotter_name"`
	Latitude     float64   `json:"latitude"`
	Longitude    float64   `json:"longitude"`
	CreatedAt    time.Time `json:"created_at"`
}

type LeaderboardEntry struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`      // login (used as fallback / unique key)
	Name     string `json:"name"`           // display name or username — what's shown
	Count    int    `json:"count"`
}

type Leaderboard struct {
	TopSpotters    []LeaderboardEntry `json:"top_spotters"`
	TopCollectors  []LeaderboardEntry `json:"top_collectors"`
	TopCommenters  []LeaderboardEntry `json:"top_commenters"`
}
