-- This is an empty migration.
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "book_author_trgm_idx" ON "Book" USING GIN ("author" gin_trgm_ops);