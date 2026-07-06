package models

import "time"

type Fish struct {
	ID            int       `json:"id"`
	PhotoFilename string    `json:"photo_filename"`
	PhotoURL      string    `json:"photo_url,omitempty"`
	Latitude      float64   `json:"latitude"`
	Longitude     float64   `json:"longitude"`
	AddressHint   string    `json:"address_hint"`
	SpottedBy     int       `json:"spotted_by"`
	SpotterName   string    `json:"spotter_name,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

type FishDetail struct {
	Fish
	Collectors []CollectorEntry `json:"collectors"`
}

type CollectorEntry struct {
	Username  string    `json:"username"`
	CollectedAt time.Time `json:"collected_at"`
}

type NearbyFish struct {
	Fish
	DistanceMeters float64 `json:"distance_meters"`
}
