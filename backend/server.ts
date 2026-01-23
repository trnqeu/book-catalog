import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { PrismaClient } from './prisma/generated/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;
if (!process.env.JWT_SECRET) {
    throw new Error("FATAL ERROR: JWT_SECRET is not defined")
}
const JWT_SECRET = process.env.JWT_SECRET;

// Database configuration
const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient( { adapter });

app.use(cors());
app.use(express.json());

// Authentication Middleware
const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Missing token' })

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token'});
        req.user = user;
        next();
    });    
};


// Main route: get all books (with optional search)
app.get('/api/books', authenticateToken,  async (req, res) => {
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

// Authenticated route to add books
app.post('/api/books', authenticateToken, async (req, res) => {
    try {
        const { title, author, description, coverUrl, publishingHouse, language, format } = req.body;

        // Minimal validation for title
        if (!title) return res.status(400).json({ error: "Title is mandatory" });

        const newBook = await prisma.book.create({
            data: {
                title,
                author: author,
                description,
                coverUrl,
                publishingHouse,
                language,
                format: format || "Ebook"
            }
        });
        console.log(`✅ Book saved: ${title}`)
        res.status(201).json(newBook);
} catch (error) {
    console.error(`Error saving:`, error);
    res.status(500).json({ error: "Error during database saving"});
}
});

app.post('api/login', (req,res) => {
    const { password } = req.body;

    if (password === process.env.ADMIN_PASSWORD) {
        // Generate token is password is ok
        const token = jwt.sign(
            {
                sub: 'admin',
                iss: 'trnq'
            },
            JWT_SECRET,
            { expiresIn: '24h' } // the token expires every day
        );
        return res.json( { token });
    }

    res.status(401).json({ error: "Wrong password" });
});

app.listen(port, () => {
    console.log(`Server listing on http://localhost:${port}`);
});

