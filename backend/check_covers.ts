import "dotenv/config";
import { PrismaClient } from './prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL?.replace('book_db', 'localhost');
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkCovers() {
    const books = await prisma.book.findMany({
        take: 5
    });
    console.log(JSON.stringify(books.map(b => ({ id: b.id, coverUrl: b.coverUrl })), null, 2));
}

checkCovers().finally(() => {
    prisma.$disconnect();
    pool.end();
});
