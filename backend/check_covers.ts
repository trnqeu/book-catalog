import "dotenv/config";
import { PrismaClient } from './prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL?.replace('book_db', 'localhost');
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkCovers() {
    const targetId = process.argv[2];
    if (targetId) {
        const book = await prisma.book.findUnique({
            where: { id: Number(targetId) }
        });
        console.log(`--- Risultato per ID ${targetId} ---`);

        console.log(JSON.stringify(book ? { id: book.id, coverUrl: book.coverUrl } : "Libro non trovato", null, 2));

    } else {
        const books = await prisma.book.findMany({
            take: 10,
            orderBy: { id: 'desc' } // Vediamo gli ultimi inseriti
        });
        console.log("--- Ultimi 10 libri inseriti ---");

        console.log(JSON.stringify(books.map(b => ({ id: b.id, title: b.title, coverUrl: b.coverUrl })), null, 2));
    }

}

checkCovers().finally(() => {
    prisma.$disconnect();
    pool.end();
});
