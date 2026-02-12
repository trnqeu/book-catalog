// cspell:ignore frontcover
import "dotenv/config";
import { PrismaClient } from '../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { downloadCover } from '../lib/imageDownloader';

// Support both local and docker database URLs
const connectionString = process.env.DATABASE_URL?.replace('book_db', 'localhost');
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function migrateCovers() {
    console.log("🚀 Starting migration of existing covers to local storage...");

    // Find all books with a remote cover URL
    const books = await prisma.book.findMany({
        where: {
            coverUrl: {
                startsWith: 'http'
            }
        }
    });

    console.log(`Found ${books.length} books with remote covers.`);

    let migratedCount = 0;
    let errorCount = 0;

    for (const book of books) {
        if (!book.coverUrl) continue;

        try {
            console.log(`Migrating cover for: ${book.title} (ID: ${book.id})`);
            const localPath = await downloadCover(book.coverUrl, book.id);

            if (localPath.startsWith('/covers/')) {
                await prisma.book.update({
                    where: { id: book.id },
                    data: { coverUrl: localPath }
                });
                migratedCount++;
            } else {
                console.warn(`⚠️ Could not migrate cover for: ${book.title}. Kept original URL.`);
                errorCount++;
            }
        } catch (error) {
            console.error(`❌ Error migrating cover for ${book.title}:`, error);
            errorCount++;
        }

        if ((migratedCount + errorCount) % 10 === 0) {
            console.log(`Progress: ${migratedCount + errorCount}/${books.length} processed...`);
        }
    }

    console.log(`\n✅ Migration finished.`);
    console.log(`Successfully migrated: ${migratedCount}`);
    console.log(`Errors/Skipped: ${errorCount}`);
}

migrateCovers().finally(() => {
    prisma.$disconnect();
    pool.end();
});
