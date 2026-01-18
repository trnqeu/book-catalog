import express from 'express';
import cors from 'cors';
import { PrismaClient } from './prisma/generated/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

// Database configuration
const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient( { adapter });

app.use(cors());
app.use(express.json());


// Main route: get all books (with optional search)
app.get('/api/books', async (req, res) => {
    try {
        const { search, author } = req.query;

        const books = await prisma.book.findMany({
            where: {
                AND: [
                    search ? { title: { contains: String(search), mode: 'insensitive' } } : {},
                    author ? { author: { contains: String(author), mode: 'insensitive' } } : {}
                ]
            },
            orderBy: { title: 'asc' },
            take: 50
        });

        res.json(books);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error getting the list of books'});
    }
});

// Route for single book
app.get('/app/books/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const book = await prisma.book.findUnique({
            where: { id: Number(id)}
        });
        if (book) res.json(book);
        else res.status(404).json({ error: 'Libro non trovato' });
    } catch (error) {
        res.status(500).json({ error: 'Error getting book from database'});
    }
});

app.listen(port, () => {
    console.log(`Server listing on http://localhost:${port}`);
});

