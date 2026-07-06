package storage

import (
	"fmt"
	"image"
	"path/filepath"

	"rybaspotting/internal/config"
)

// StoreResult holds information about a stored file.
type StoreResult struct {
	Filename string // the filename/key within the storage
	URL      string // full public URL to access the file
}

// Storage defines the interface for photo storage backends.
type Storage interface {
	// Store saves JPEG data under the given filename. Returns the storing info.
	Store(filename string, data []byte, contentType string) (*StoreResult, error)

	// Delete removes a file by its storage key (filename).
	Delete(filename string) error

	// PublicURL returns the full public-facing URL for a file.
	// Returns empty string if the file doesn't exist.
	PublicURL(filename string) string

	// Exists returns true if the file exists in storage.
	Exists(filename string) bool

	// Count returns the total number of stored objects.
	Count() (int, error)

	// TotalSize returns the total size of stored objects in bytes.
	TotalSize() (int64, error)

	// StoreAvatarJPEG encodes a 200x200 cropped avatar and stores it.
	// Returns the public URL of the stored avatar.
	StoreAvatarJPEG(userID int, src image.Image) (string, error)
}

// New creates the appropriate Storage backend based on config.
func New(cfg *config.Config) (Storage, error) {
	// If R2 is configured, use it. Otherwise fall back to local disk.
	if cfg.R2Endpoint != "" && cfg.R2AccessKeyID != "" && cfg.R2SecretAccessKey != "" && cfg.R2Bucket != "" {
		r2, err := NewR2Storage(R2Config{
			Endpoint:       cfg.R2Endpoint,
			AccessKeyID:    cfg.R2AccessKeyID,
			SecretAccessKey: cfg.R2SecretAccessKey,
			Bucket:         cfg.R2Bucket,
			PublicURL:      cfg.R2PublicURL,
			Region:         "auto",
		})
		if err != nil {
			return nil, fmt.Errorf("r2 storage: %w", err)
		}
		return r2, nil
	}

	return NewLocalStorage(cfg.PhotoDir), nil
}

// BuildPaths returns the filesystem path (local) or object key (R2) for a given filename.
func BuildPaths(dir, filename string) (photoPath, thumbPath string) {
	ext := filepath.Ext(filename)
	base := filename[:len(filename)-len(ext)]
	photoPath = filepath.Join(dir, filename)
	thumbPath = filepath.Join(dir, base+"_thumb"+ext)
	return
}

// ThumbFilename computes the thumbnail filename from the main photo filename.
func ThumbFilename(filename string) string {
	ext := filepath.Ext(filename)
	base := filename[:len(filename)-len(ext)]
	return base + "_thumb" + ext
}

// AvatarKey builds the storage key for a user's avatar.
func AvatarKey(userID int) string {
	return fmt.Sprintf("avatars/%d.jpg", userID)
}

// AvatarPublicURL builds the public URL for a user's avatar.
func AvatarPublicURL(baseURL string, userID int) string {
	return fmt.Sprintf("%s/avatars/%d.jpg", baseURL, userID)
}
