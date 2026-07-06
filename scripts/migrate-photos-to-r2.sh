#!/usr/bin/env bash
# =============================================================================
# migrate-photos-to-r2.sh
# Migrate existing photos from local disk to Cloudflare R2.
#
# Prerequisites:
#   - rclone installed and configured with an R2 remote named "r2"
#     OR
#   - AWS CLI installed with R2 credentials configured
#
# Usage:
#   export R2_BUCKET=rybaspotting-photos
#   export PHOTO_DIR=/var/lib/rybaspotting/photos
#   ./scripts/migrate-photos-to-r2.sh
#
# Options:
#   --dry-run    List files without uploading
#   --delete     Delete local files after successful upload
# =============================================================================
set -euo pipefail

DRY_RUN=false
DELETE_AFTER=false

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --delete)  DELETE_AFTER=true ;;
        *)         echo "Unknown option: $arg"; exit 1 ;;
    esac
done

PHOTO_DIR="${PHOTO_DIR:-/var/lib/rybaspotting/photos}"
R2_BUCKET="${R2_BUCKET:-rybaspotting-photos}"

if [ ! -d "$PHOTO_DIR" ]; then
    echo "ERROR: PHOTO_DIR '$PHOTO_DIR' does not exist."
    exit 1
fi

echo "=== Rybaspotting Photo Migration to R2 ==="
echo "  Source: $PHOTO_DIR"
echo "  Destination: r2://$R2_BUCKET"
echo "  Dry run: $DRY_RUN"
echo "  Delete after upload: $DELETE_AFTER"
echo ""

# Count files
TOTAL=$(find "$PHOTO_DIR" -type f | wc -l)
echo "Found $TOTAL files to migrate."
echo ""

# Check if rclone is available
if command -v rclone &> /dev/null; then
    echo "Using rclone..."

    RCLONE_FLAGS="--progress --stats 5s"
    if [ "$DRY_RUN" = true ]; then
        RCLONE_FLAGS="$RCLONE_FLAGS --dry-run"
    fi

    # Sync entire directory structure to R2
    # rclone sync makes destination match source (including deletes if --delete is set)
    rclone copy "$PHOTO_DIR" "r2:${R2_BUCKET}" $RCLONE_FLAGS

    if [ "$DELETE_AFTER" = true ] && [ "$DRY_RUN" = false ]; then
        echo ""
        echo "=== Removing local files after successful upload ==="
        find "$PHOTO_DIR" -type f -delete
        echo "Done. Local files removed."
    fi

elif command -v aws &> /dev/null; then
    echo "Using AWS CLI (S3-compatible)..."

    AWS_FLAGS=""
    if [ "$DRY_RUN" = true ]; then
        AWS_FLAGS="--dryrun"
    fi

    # Upload all files recursively
    aws s3 sync "$PHOTO_DIR" "s3://${R2_BUCKET}" \
        --endpoint-url "${R2_ENDPOINT:-https://auto.r2.cloudflarestorage.com}" \
        $AWS_FLAGS --no-progress

    if [ "$DELETE_AFTER" = true ] && [ "$DRY_RUN" = false ]; then
        echo ""
        echo "=== Removing local files after successful upload ==="
        find "$PHOTO_DIR" -type f -delete
        echo "Done. Local files removed."
    fi

else
    echo "ERROR: Neither rclone nor aws CLI found."
    echo ""
    echo "Install one of:"
    echo "  rclone:  curl https://rclone.org/install.sh | sudo bash"
    echo "  aws cli: pip install awscli"
    echo ""
    echo "Then configure R2 access:"
    echo ""
    echo "  # rclone:"
    echo "  rclone config create r2 s3 \\"
    echo "    provider Cloudflare \\"
    echo "    access_key_id YOUR_R2_ACCESS_KEY \\"
    echo "    secret_access_key YOUR_R2_SECRET_KEY \\"
    echo "    endpoint https://<accountid>.r2.cloudflarestorage.com"
    echo ""
    echo "  # aws cli:"
    echo "  aws configure set aws_access_key_id YOUR_R2_ACCESS_KEY \\"
    echo "    --profile r2"
    echo "  aws configure set aws_secret_access_key YOUR_R2_SECRET_KEY \\"
    echo "    --profile r2"
    exit 1
fi

echo ""
echo "=== Migration complete ==="
echo "Verify with: rclone ls r2:${R2_BUCKET}"
