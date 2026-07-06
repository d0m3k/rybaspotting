package storage

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/disintegration/imaging"
)

// R2Config holds the configuration for an R2 storage backend.
type R2Config struct {
	Endpoint        string
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	PublicURL       string
	Region          string
}

// R2Storage implements Storage using Cloudflare R2 (S3-compatible API).
type R2Storage struct {
	client    *s3.Client
	bucket    string
	publicURL string
}

// NewR2Storage creates a new R2 storage backend.
func NewR2Storage(cfg R2Config) (*R2Storage, error) {
	resolver := aws.EndpointResolverWithOptionsFunc(
		func(service, region string, options ...interface{}) (aws.Endpoint, error) {
			return aws.Endpoint{
				URL:               cfg.Endpoint,
				HostnameImmutable: true,
				SigningRegion:     cfg.Region,
			}, nil
		},
	)

	awsCfg, err := config.LoadDefaultConfig(
		context.Background(),
		config.WithRegion(cfg.Region),
		config.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		),
		config.WithEndpointResolverWithOptions(resolver),
	)
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true
	})

	return &R2Storage{
		client:    client,
		bucket:    cfg.Bucket,
		publicURL: cfg.PublicURL,
	}, nil
}

// Store uploads data to R2 under the given key.
func (r *R2Storage) Store(key string, data []byte, contentType string) (*StoreResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err := r.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(r.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return nil, fmt.Errorf("put object: %w", err)
	}

	return &StoreResult{
		Filename: key,
		URL:      r.publicURL + "/" + key,
	}, nil
}

// StoreFullAndThumb resizes an image, then uploads both full-size and thumbnail to R2.
func (r *R2Storage) StoreFullAndThumb(key string, src image.Image, maxWidth int) (string, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resized := imaging.Resize(src, maxWidth, 0, imaging.Lanczos)
	thumb := imaging.Resize(src, 200, 0, imaging.Lanczos)

	// Full photo
	var fullBuf bytes.Buffer
	if err := imaging.Encode(&fullBuf, resized, imaging.JPEG, imaging.JPEGQuality(85)); err != nil {
		return "", "", fmt.Errorf("encode full: %w", err)
	}

	_, err := r.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(r.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(fullBuf.Bytes()),
		ContentType: aws.String("image/jpeg"),
	})
	if err != nil {
		return "", "", fmt.Errorf("put full: %w", err)
	}

	// Thumbnail
	thumbKey := ThumbFilename(key)
	var thumbBuf bytes.Buffer
	if err := imaging.Encode(&thumbBuf, thumb, imaging.JPEG, imaging.JPEGQuality(80)); err != nil {
		// Full photo already uploaded, try to clean up
		r.client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
			Bucket: aws.String(r.bucket),
			Key:    aws.String(key),
		})
		return "", "", fmt.Errorf("encode thumb: %w", err)
	}

	_, err = r.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(r.bucket),
		Key:         aws.String(thumbKey),
		Body:        bytes.NewReader(thumbBuf.Bytes()),
		ContentType: aws.String("image/jpeg"),
	})
	if err != nil {
		// Clean up the full photo we already uploaded
		r.client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
			Bucket: aws.String(r.bucket),
			Key:    aws.String(key),
		})
		return "", "", fmt.Errorf("put thumb: %w", err)
	}

	return r.publicURL + "/" + key, r.publicURL + "/" + thumbKey, nil
}

// StoreAvatarJPEG encodes and uploads a 200x200 cropped avatar to R2.
func (r *R2Storage) StoreAvatarJPEG(userID int, src image.Image) (string, error) {
	key := AvatarKey(userID)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	avatar := imaging.Fill(src, 200, 200, imaging.Center, imaging.Lanczos)

	var buf bytes.Buffer
	if err := imaging.Encode(&buf, avatar, imaging.JPEG, imaging.JPEGQuality(80)); err != nil {
		return "", fmt.Errorf("encode avatar: %w", err)
	}

	_, err := r.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(r.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(buf.Bytes()),
		ContentType: aws.String("image/jpeg"),
	})
	if err != nil {
		return "", fmt.Errorf("put avatar: %w", err)
	}

	return r.publicURL + "/" + key, nil
}

// Delete removes an object from R2.
func (r *R2Storage) Delete(key string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := r.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(r.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("delete object: %w", err)
	}
	return nil
}

// PublicURL returns the full public URL for a file.
func (r *R2Storage) PublicURL(key string) string {
	return r.publicURL + "/" + key
}

// Exists checks whether an object exists in R2.
func (r *R2Storage) Exists(key string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := r.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(r.bucket),
		Key:    aws.String(key),
	})
	return err == nil
}

// Count returns the number of objects in the R2 bucket (up to 1000 for performance).
func (r *R2Storage) Count() (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	result, err := r.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket:  aws.String(r.bucket),
		MaxKeys: aws.Int32(1000),
	})
	if err != nil {
		return 0, fmt.Errorf("list objects: %w", err)
	}

	return int(*result.KeyCount), nil
}

// TotalSize returns the total size of stored objects in bytes (up to 1000 objects).
func (r *R2Storage) TotalSize() (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var totalSize int64
	paginator := s3.NewListObjectsV2Paginator(r.client, &s3.ListObjectsV2Input{
		Bucket: aws.String(r.bucket),
	})

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return totalSize, nil // return partial on error
		}
		for _, obj := range page.Contents {
			if obj.Size != nil {
				totalSize += *obj.Size
			}
		}
	}

	return totalSize, nil
}
