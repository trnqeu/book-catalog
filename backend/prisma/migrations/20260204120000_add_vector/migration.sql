-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "coverUrl" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "embedding" vector(384),
ADD COLUMN     "publishedDate" TEXT;
