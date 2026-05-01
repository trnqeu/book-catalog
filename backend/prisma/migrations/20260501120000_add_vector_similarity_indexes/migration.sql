-- Speed up nearest-neighbour searches used by /app/books/:id/similar.
CREATE INDEX IF NOT EXISTS "book_embedding_hnsw_idx"
ON "Book" USING hnsw ("embedding" vector_cosine_ops)
WHERE "embedding" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "book_embedding_gemma_hnsw_idx"
ON "Book" USING hnsw ("embeddingGemma" vector_cosine_ops)
WHERE "embeddingGemma" IS NOT NULL;
