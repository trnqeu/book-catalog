// cspell:ignore frontcover
import "dotenv/config";
import { PrismaClient } from '../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL?.replace('book_db', 'localhost');
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function updateCovers() {
    console.log("Starting bulk update of book covers...");

    // Find all books with a Google Books cover URL
    const books = await prisma.book.findMany({
        where: {
            coverUrl: {
                contains: 'google.com'
            }
        }
    });

    console.log(`Found ${books.length} books with Google Books covers.`);

    let updatedCount = 0;

    for (const book of books) {
        if (!book.coverUrl) continue;

        // Extract volume ID from URL
        // Pattern 1: id=VOLUME_ID&
        // Pattern 2: frontcover/VOLUME_ID?
        let volumeId: string | null = null;

        const idMatch = book.coverUrl.match(/id=([^&]+)/);
        if (idMatch) {
            volumeId = idMatch[1] ?? null;
        } else {
            const pathMatch = book.coverUrl.match(/frontcover\/([^?]+)/);
            if (pathMatch) {
                volumeId = pathMatch[1] ?? null;
            }
        }

        if (volumeId) {
            const highResUrl = `https://books.google.com/books/publisher/content/images/frontcover/${volumeId}?fife=w600-h900&source=gbs_api`;

            // Only update if it's different from current
            if (book.coverUrl !== highResUrl) {
                await prisma.book.update({
                    where: { id: book.id },
                    data: { coverUrl: highResUrl }
                });
                updatedCount++;
                if (updatedCount % 10 === 0) {
                    console.log(`Updated ${updatedCount} covers...`);
                }
            }
        }
    }

    console.log(`Finished. ${updatedCount} covers updated to high-resolution.`);
}

updateCovers().finally(() => {
    prisma.$disconnect();
    pool.end();
});
