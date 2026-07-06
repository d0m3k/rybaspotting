package storage

import (
	"fmt"
	"image"
	"os"
	"path/filepath"

	"github.com/disintegration/imaging"
)

// LocalStorage implements Storage using the local filesystem.
type LocalStorage struct {
	dir     string
	baseURL string // e.g. "/api/photos" for constructing public URLs
}

// NewLocalStorage creates a new local filesystem storage backend.
func NewLocalStorage(dir string) *LocalStorage {
	return &LocalStorage{
		dir:     dir,
		baseURL: "/api/photos",
	}
}

// Store saves an already-encoded JPEG byte slice to disk.
func (l *LocalStorage) Store(filename string, data []byte, contentType string) (*StoreResult, error) {
	// Ensure subdirectories exist (e.g. avatars/)
	fullPath := filepath.Join(l.dir, filename)
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("mkdir: %w", err)
	}

	out, err := os.Create(fullPath)
	if err != nil {
		return nil, fmt.Errorf("create file: %w", err)
	}
	defer out.Close()

	if _, err := out.Write(data); err != nil {
		return nil, fmt.Errorf("write file: %w", err)
	}

	return &StoreResult{
		Filename: filename,
		URL:      l.baseURL + "/" + filename,
	}, nil
}

// StoreJPEG is a helper for the local backend that handles resize+encode.
// It resizes src to maxWidth (0 = no resize), fills to square for thumbnails,
// and saves both the full photo and its thumbnail.
func (l *LocalStorage) StoreFullAndThumb(key string, src image.Image, maxWidth int) (string, string, error) {
	// Ensure directory exists
	dir := filepath.Dir(filepath.Join(l.dir, key))
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", "", fmt.Errorf("mkdir: %w", err)
	}

	resized := imaging.Resize(src, maxWidth, 0, imaging.Lanczos)
	thumb := imaging.Resize(src, 200, 0, imaging.Lanczos)

	// Full photo
	fullPath := filepath.Join(l.dir, key)
	fullOut, err := os.Create(fullPath)
	if err != nil {
		return "", "", fmt.Errorf("create full: %w", err)
	}
	defer fullOut.Close()
	if err := imaging.Encode(fullOut, resized, imaging.JPEG, imaging.JPEGQuality(85)); err != nil {
		return "", "", fmt.Errorf("encode full: %w", err)
	}

	// Thumbnail
	thumbKey := ThumbFilename(key)
	thumbPath := filepath.Join(l.dir, thumbKey)
	thumbOut, err := os.Create(thumbPath)
	if err != nil {
		return "", "", fmt.Errorf("create thumb: %w", err)
	}
	defer thumbOut.Close()
	if err := imaging.Encode(thumbOut, thumb, imaging.JPEG, imaging.JPEGQuality(80)); err != nil {
		return "", "", fmt.Errorf("encode thumb: %w", err)
	}

	return l.baseURL + "/" + key, l.baseURL + "/" + thumbKey, nil
}

// StoreAvatarJPEG encodes and saves an already-processed avatar image.
func (l *LocalStorage) StoreAvatarJPEG(userID int, src image.Image) (string, error) {
	key := AvatarKey(userID)
	fullPath := filepath.Join(l.dir, key)

	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("mkdir: %w", err)
	}

	avatar := imaging.Fill(src, 200, 200, imaging.Center, imaging.Lanczos)

	out, err := os.Create(fullPath)
	if err != nil {
		return "", fmt.Errorf("create avatar: %w", err)
	}
	defer out.Close()

	if err := imaging.Encode(out, avatar, imaging.JPEG, imaging.JPEGQuality(80)); err != nil {
		return "", fmt.Errorf("encode avatar: %w", err)
	}

	return l.baseURL + "/" + key, nil
}

// Delete removes a file from the local filesystem.
func (l *LocalStorage) Delete(filename string) error {
	path := filepath.Join(l.dir, filename)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// PublicURL returns the public-facing URL for a file.
func (l *LocalStorage) PublicURL(filename string) string {
	return l.baseURL + "/" + filename
}

// Exists checks if a file exists on disk.
func (l *LocalStorage) Exists(filename string) bool {
	_, err := os.Stat(filepath.Join(l.dir, filename))
	return err == nil
}

// Count returns the number of files in the storage directory.
func (l *LocalStorage) Count() (int, error) {
	ents, err := os.ReadDir(l.dir)
	if err != nil {
		return 0, err
	}
	count := 0
	for _, e := range ents {
		if !e.IsDir() {
			continue
		}
		subEnts, err := os.ReadDir(filepath.Join(l.dir, e.Name()))
		if err != nil {
			continue
		}
		for _, se := range subEnts {
			if !se.IsDir() {
				count++
			}
		}
	}
	// Also count files in root dir
	for _, e := range ents {
		if e.IsDir() {
			continue
		}
		count++
	}
	return count, nil
}

// TotalSize returns the total size of all files in bytes.
func (l *LocalStorage) TotalSize() (int64, error) {
	var total int64
	err := filepath.Walk(l.dir, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // skip on error
		}
		if !info.IsDir() {
			total += info.Size()
		}
		return nil
	})
	return total, err
}
