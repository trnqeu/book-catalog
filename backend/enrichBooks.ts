import "dotenv/config";
import { PrismaClient } from './prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import axios from 'axios';
// cspell:ignore intitle inauthor

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function enrich() {
    // Search for the books with no description
    const books = await prisma.book.findMany({
        where: { description: null },
        take: 100
    });

    console.log(`Starts enriching ${books.length}...`);

    for (const book of books) {
        try {
            if (!book || !book.title || !book.author) continue;
            const queryTitle = (book.title as string).split('(')[0].trim();
            const queryAuthor = book.author as string;

            console.log(`Searching: ${queryTitle} - ${queryAuthor}`);

            const response = await axios.get(`https://www.googleapis.com/books/v1/volumes`, {
                params: {
                    q: `intitle:${queryTitle}+inauthor:${queryAuthor}`,
                    maxResults: 1
                }
            });

            const item = response.data.items?.[0];
            const data = item?.volumeInfo;
            const volumeId = item?.id;

            if (data && volumeId) {
                const highResCoverUrl = `https://books.google.com/books/publisher/content/images/frontcover/${volumeId}?fife=w600-h900&source=gbs_api`;

                await prisma.book.update({
                    where: { id: book.id },
                    data: {
                        description: data.description || "No available description",
                        publishingHouse: data.publisher || "Unknown",
                        publishedDate: data.publishedDate || "N.D.",
                        coverUrl: highResCoverUrl,
                        language: data.language ? data.language.toLowerCase() : book.language
                    }
                });
                console.log(`✅ [Updated] ${book.title}`);
            } else {
                console.log(`⚠️ [No data available] ${book.title}`)
                await prisma.book.update({
                    where: { id: book.id },
                    data: { description: "Description not found on Google Books" }
                });
            }

            await delay(3000);
        } catch (error) {
            console.error(`Error during enrichment of ${book.title}:`, error);


        }
    }
}

enrich().finally(() => {
    prisma.$disconnect();
    pool.end();
});