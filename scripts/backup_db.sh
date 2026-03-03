#!/bin/bash

# Database Backup Script for book_db container
# Usage: ./scripts/backup_db.sh

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "Error: .env file not found in root directory."
    exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups"
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_$TIMESTAMP.sql"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "🚀 Starting database backup for $DB_NAME..."

# Run pg_dump in the container
docker exec book_db pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Backup completed: $BACKUP_FILE"
    # Optional: Gzip the backup to save space
    gzip "$BACKUP_FILE"
    echo "📦 Compressed: ${BACKUP_FILE}.gz"
    
    # Optional: Keep only last 30 days of backups
    find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +30 -delete
    echo "🧹 Old backups (older than 30 days) cleaned up."
else
    echo "❌ Error: Backup failed."
    exit 1
fi
