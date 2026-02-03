import { PrismaClient } from '../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import EmbeddingService from '../services/embeddingService';
import 'dotenv/config';

// initialize prisma client
const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("Starting embeddings generation...")

    // get all books fom database
    const books = await prisma.book.findMany({
        orderBy: { id: 'asc' }
    });

    console.log(`Found ${books.length} books. Prcessing...`);

    let updatedCount = 0;

    // cycle on each book
    for (const book of books) {
        try {
            const textToEmbed = `${book.title} ${book.description || ''}`;

            console.log(`Elaborating: "${book.title}"...`);

            const embedding = await EmbeddingService.generateEmbedding(textToEmbed);

            // save using raw SQL because Prisma doesn't support vector columns yet
            const embeddingString = `[${embedding.join(',')}]`;

            await prisma.$executeRaw`
        UPDATE "Book"
        SET "embedding" = ${embeddingString}::vector
        WHERE "id" = ${book.id}
        `;

            updatedCount++;
        } catch (error) {
            console.error(`Error on book ID ${book.id}:`, error);
        }
    }
    console.log(`Finished. ${updatedCount} updated books.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });