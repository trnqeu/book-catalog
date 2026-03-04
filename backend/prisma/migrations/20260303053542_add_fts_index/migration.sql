-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "embeddingGemma" vector(768);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "book_search_idx" ON "Book" 
USING GIN (to_tsvector('simple', "title" || ' ' || "author"));
