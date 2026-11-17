import { PrismaClient } from '../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import 'dotenv/config';
import EmbeddingService from '../src/services/embeddingService';

// Fills Book.embeddingGemma (used by /app/books/:id/similar).
//
// Usage:
//   npm run embed:gemma                # only books with no embedding yet
//   npm run embed:gemma -- --all       # re-embed every book
//   npm run embed:gemma -- --dry-run   # list the books it would process, write nothing
//
// Resumable: by default it only picks books where embeddingGemma IS NULL, so
// it can be interrupted and re-run at any time.

const args = process.argv.slice(2);
const ALL = args.includes('--all');
const DRY_RUN = args.includes('--dry-run');
const EXPECTED_DIMS = 768;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function embed(text: string): Promise<number[]> {
    const embedding = await EmbeddingService.generateGemmaEmbedding(text);
    if (!Array.isArray(embedding) || embedding.length !== EXPECTED_DIMS) {
        throw new Error(`Unexpected embedding length: ${embedding?.length ?? 'none'} (expected ${EXPECTED_DIMS})`);
    }
    return embedding;
}

async function processBooks(): Promise<number> {
    const books = ALL
        ? await prisma.$queryRaw<{ id: number; title: string; description: string | null }[]>`
            SELECT "id", "title", "description" FROM "Book" ORDER BY "id"`
        : await prisma.$queryRaw<{ id: number; title: string; description: string | null }[]>`
            SELECT "id", "title", "description" FROM "Book"
            WHERE "embeddingGemma" IS NULL ORDER BY "id"`;

    console.log(`📚 ${books.length} books to process${ALL ? ' (--all)' : ' (missing embedding)'}.`);
    if (books.length === 0) return 0;

    if (DRY_RUN) {
        for (const book of books) console.log(`  [${book.id}] ${book.title}`);
        return 0;
    }

    // Fail fast if Ollama is down or the model isn't pulled, instead of
    // logging the same error once per book and leaving them all NULL.
    try {
        await embed('test');
    } catch (error) {
        console.error('💥 Ollama preflight failed — is it running and is "embeddinggemma" pulled?', error);
        return 1;
    }

    const failed: number[] = [];
    for (const [i, book] of books.entries()) {
        try {
            const text = `${book.title} ${book.description || ''}`.trim();
            const embedding = await embed(text);
            await prisma.$executeRaw`
                UPDATE "Book"
                SET "embeddingGemma" = ${`[${embedding.join(',')}]`}::vector
                WHERE "id" = ${book.id}
            `;
            console.log(`✅ ${i + 1}/${books.length} [${book.id}] ${book.title}`);
        } catch (error) {
            failed.push(book.id);
            console.error(`❌ ${i + 1}/${books.length} [${book.id}] ${book.title}:`, error);
        }
    }

    console.log(`\nDone: ${books.length - failed.length} embedded, ${failed.length} failed.`);
    if (failed.length) {
        console.log(`Failed IDs: ${failed.join(', ')} — re-run the script to retry them.`);
        return 1;
    }
    return 0;
}

processBooks()
    .then(code => { process.exitCode = code; })
    .catch(error => { console.error('💥 Fatal error:', error); process.exitCode = 1; })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
