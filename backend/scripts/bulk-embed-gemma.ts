import { PrismaClient } from '../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import 'dotenv/config';
import EmbeddingService from '../src/services/embeddingService';

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function processBooks() {
    console.log("🚀 Starting bulk embedding with Gemma...");

    try {
        const books = await prisma.book.findMany({
            select: { id: true, title: true, description: true }
        });

        console.log(`📚 Found ${books.length} books to process.`);

        for (const book of books) {
            try {
                const textToEmbed = `${book.title} ${book.description || ''}`.trim();
                console.log(`🔄 Processing [${book.id}] ${book.title}...`);

                const embedding = await EmbeddingService.generateGemmaEmbedding(textToEmbed);
                const embeddingString = `[${embedding.join(',')}]`;

                await prisma.$executeRaw`
                    UPDATE "Book"
                    SET "embeddingGemma" = ${embeddingString}::vector
                    WHERE "id" = ${book.id}
                `;
            } catch (error) {
                console.error(`❌ Error processing book ${book.id}:`, error);
            }
        }

        console.log("✅ Bulk embedding completed successfully!");
    } catch (error) {
        console.error("💥 Fatal error during bulk embedding:", error);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

processBooks();
