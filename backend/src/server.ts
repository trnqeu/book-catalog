import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import path from 'path';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '../prisma/generated/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg';
import 'dotenv/config';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import axios from 'axios';
import EmbeddingService from './services/embeddingService';
import { downloadCover } from './lib/imageDownloader';

const app = express();
const port = process.env.PORT || 3000;
if (!process.env.JWT_SECRET) {
    throw new Error("FATAL ERROR: JWT_SECRET is not defined")
}
const JWT_SECRET = process.env.JWT_SECRET;

// Swagger definition
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Book Catalog API',
            version: '1.0.0',
            description: 'API for managing a book catalog',
        },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [{
            bearerAuth: [],
        }],
    },
    apis: ["./src/server.ts"], // files containing annotations as above
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

// Database configuration
const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

app.use(helmet());

// CORS: restrict to known frontend origins via CORS_ORIGIN (comma-separated).
// Falls back to allow-all only when unset, with a loud warning, so local/dev
// setups keep working until this is configured explicitly.
const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

if (allowedOrigins.length === 0) {
    console.warn('⚠️  CORS_ORIGIN is not set — accepting requests from any origin. Set CORS_ORIGIN to your frontend URL(s) before deploying publicly.');
}

const corsOptions: cors.CorsOptions = {
    origin: allowedOrigins.length === 0 ? true : allowedOrigins,
};

app.use(cors(corsOptions));
app.use(express.json());
// Serve static files from 'public' folder
// Use process.cwd() to be more robust against __dirname issues in some environments
const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));
// Explicitly serve covers with CORS (useful for some browser configurations)
app.use('/covers', cors(corsOptions), express.static(path.join(publicPath, 'covers')));

// General throttle for the API: the search/similarity endpoints are
// unauthenticated and call out to Ollama (and, at creation time, Google
// Books), so an unlimited client can burn compute/API quota for free.
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', apiLimiter);
app.use('/app', apiLimiter);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Authentication Middleware
const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Missing token' })

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

const parseLimit = (value: unknown, fallback = 6, max = 20) => {
    const parsed = parseInt(String(value || ''), 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, 1), max);
};


/**
 * @swagger
 * /api/books:
 *   get:
 *     summary: Retrieve a list of books
 *     description: Retrieve a list of books with optional search by title or author.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by title
 *       - in: query
 *         name: author
 *         schema:
 *           type: string
 *         description: Search by author
 *     responses:
 *       200:
 *         description: A list of books
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   title:
 *                     type: string
 *                   author:
 *                     type: string
 */
// Main route: get all books (with optional search)
app.get('/api/books', authenticateToken, async (req, res) => {
    try {
        const { search, author } = req.query;

        let books;

        if (search) {
            // Global search using FTS
            const authorQuery = author ? String(author) : '';
            books = await prisma.$queryRaw`
                SELECT *, 
                       ts_rank(to_tsvector('simple', "title" || ' ' || "author"), websearch_to_tsquery('simple', ${search})) as rank
                FROM "Book"
                WHERE to_tsvector('simple', "title" || ' ' || "author") @@ websearch_to_tsquery('simple', ${search})
                  AND (
                    ${authorQuery} = '' 
                    OR to_tsvector('simple', "author") @@ websearch_to_tsquery('simple', ${authorQuery})
                    OR "author" % ${authorQuery}
                  )
                ORDER BY rank DESC
                LIMIT 50;
            `;
        } else if (author) {
            // Specific author search using FTS (order) + Trigrams (fuzzy/typos)
            const authorQuery = String(author);
            books = await prisma.$queryRaw`
                SELECT *, 
                       similarity("author", ${authorQuery}) as author_sim
                FROM "Book"
                WHERE to_tsvector('simple', "author") @@ websearch_to_tsquery('simple', ${authorQuery})
                   OR "author" % ${authorQuery}
                ORDER BY author_sim DESC
                LIMIT 50;
            `;
        } else {
            // Fallback: list all
            books = await prisma.book.findMany({
                orderBy: { title: 'asc' },
                take: 50
            });
        }

        res.json(books);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error getting the list of books' });
    }
});

/**
 * @swagger
 * /app/books/{id}:
 *   get:
 *     summary: Get a book by ID
 *     description: Retrieve details of a specific book.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the book to retrieve
 *     responses:
 *       200:
 *         description: A single book
 *       404:
 *         description: Book not found
 */
// Route for single book
app.get('/app/books/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const book = await prisma.book.findUnique({
            where: { id: Number(id) }
        });
        if (book) res.json(book);
        else res.status(404).json({ error: 'Libro non trovato' });
    } catch (error) {
        res.status(500).json({ error: 'Error getting book from database' });
    }
});

/**
 * @swagger
 * /app/books/{id}/similar:
 *   get:
 *     summary: Get books similar to a specific book
 *     description: Finds nearest neighbours using pgvector cosine distance against the book's Gemma embedding.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the source book
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 6
 *         description: Maximum number of similar books to return
 *     responses:
 *       200:
 *         description: Ordered list of similar books
 *       400:
 *         description: Invalid book ID
 *       404:
 *         description: Book not found
 *       422:
 *         description: Book has no embedding for similarity search
 */
app.get('/app/books/:id/similar', async (req, res) => {
    const bookId = Number(req.params.id);

    if (!Number.isInteger(bookId) || bookId <= 0) {
        return res.status(400).json({ error: 'Invalid book ID' });
    }

    try {
        const [sourceBook] = await prisma.$queryRaw<{
            id: number;
            hasEmbedding: boolean;
        }[]>`
            SELECT "id",
                   "embeddingGemma" IS NOT NULL AS "hasEmbedding"
            FROM "Book"
            WHERE "id" = ${bookId}
            LIMIT 1;
        `;

        if (!sourceBook) {
            return res.status(404).json({ error: 'Libro non trovato' });
        }

        if (!sourceBook.hasEmbedding) {
            return res.status(422).json({ error: 'No embedding available for this book' });
        }

        const maxResults = parseLimit(req.query.limit);
        const similarBooks = await prisma.$queryRaw`
            SELECT b."id",
                   b."title",
                   b."author",
                   b."description",
                   b."coverUrl",
                   b."language",
                   b."publishingHouse",
                   b."format",
                   b."publishedDate",
                   1 - (b."embeddingGemma" <=> src."embeddingGemma") AS "similarity"
            FROM "Book" b, (SELECT "embeddingGemma" FROM "Book" WHERE "id" = ${bookId}) AS src
            WHERE b."id" <> ${bookId}
              AND b."embeddingGemma" IS NOT NULL
            ORDER BY b."embeddingGemma" <=> src."embeddingGemma" ASC
            LIMIT ${maxResults};
        `;

        res.json(similarBooks);
    } catch (error) {
        console.error('Error getting similar books:', error);
        res.status(500).json({ error: 'Error getting similar books' });
    }
});

/**
 * @swagger
 * /api/books:
 *   post:
 *     summary: Create a new book
 *     description: Creates a new book and automatically generates a Gemma embedding for it.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               author:
 *                 type: string
 *               description:
 *                 type: string
 *               coverUrl:
 *                 type: string
 *               publishingHouse:
 *                 type: string
 *               language:
 *                 type: string
 *               format:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Missing title
 *       401:
 *          description: Unauthorized
 */
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
        let finalCoverUrl = coverUrl;
        let finalDescription = description;

        // 1. Google Books Enrichment
        try {
            const queryTitle = title.split('(')[0].trim();
            const googleBooksRes = await axios.get(`https://www.googleapis.com/books/v1/volumes`, {
                params: {
                    q: `intitle:${queryTitle}+inauthor:${author}`,
                    maxResults: 1
                }
            });

            const item = googleBooksRes.data.items?.[0];
            const data = item?.volumeInfo;
            const volumeId = item?.id;

            if (data && volumeId) {
                const remoteCoverUrl = `https://books.google.com/books/publisher/content/images/frontcover/${volumeId}?fife=w400-h600&source=gbs_api`;
                // Cache cover locally
                try {
                    finalCoverUrl = await downloadCover(remoteCoverUrl, newBook.id);
                } catch (dlError) {
                    console.error(`Error downloading cover for: ${title}`, dlError);
                }

                if (!description && data.description) {
                    finalDescription = data.description;
                }
            }
        } catch (gbError) {
            console.error(`Error fetching Google Books metadata for: ${title}`, gbError);
        }

        // 2. Generate Embedding & Update DB
        try {
            const textToEmbed = `${title} ${finalDescription || ''}`;
            const embeddingGemma = await EmbeddingService.generateGemmaEmbedding(textToEmbed);

            // Update database with metadata (cover, description) and the embedding vector
            await prisma.$executeRaw`
                UPDATE "Book"
                SET "embeddingGemma" = ${`[${embeddingGemma.join(',')}]`}::vector,
                    "coverUrl" = ${finalCoverUrl || null},
                    "description" = ${finalDescription || null}
                WHERE "id" = ${newBook.id}
            `;
            console.log(`Embedding (Gemma) and local cover generated for: ${title}`);
        } catch (embError) {
            console.error(`Error generating embeddings for: ${title}`, embError);

            // If embedding fails but metadata was successfully fetched, still save the metadata
            if (finalCoverUrl !== coverUrl || finalDescription !== description) {
                try {
                    await prisma.book.update({
                        where: { id: newBook.id },
                        data: {
                            coverUrl: finalCoverUrl,
                            description: finalDescription
                        }
                    });
                } catch (dbError) {
                    console.error(`Error updating book metadata after embedding failure for: ${title}`, dbError);
                }
            }
        }
        res.status(201).json(newBook);
    } catch (error) {
        console.error(`Error saving:`, error);
        res.status(500).json({ error: "Error during database saving" });
    }
});

/**
 * @swagger
 * /api/books/{id}:
 *   patch:
 *     summary: Update an existing book
 *     description: Updates a book's details. If the title or description is changed, its Gemma embedding is automatically regenerated.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the book to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               author:
 *                 type: string
 *               description:
 *                 type: string
 *               coverUrl:
 *                 type: string
 *               publishingHouse:
 *                 type: string
 *               language:
 *                 type: string
 *               format:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated book object
 *       404:
 *         description: Book not found
 *       401:
 *         description: Unauthorized
 */
// Fields a client is allowed to update. Anything else in the body (id,
// createdAt, embedding, embeddingGemma, ...) is silently dropped instead of
// being passed straight through to Prisma.
const UPDATABLE_BOOK_FIELDS = [
    'title', 'author', 'description', 'coverUrl',
    'publishingHouse', 'language', 'format', 'publishedDate',
] as const;

type UpdatableBookFields = Partial<Record<typeof UPDATABLE_BOOK_FIELDS[number], string>>;

function pickUpdatableFields(body: Record<string, unknown>): UpdatableBookFields {
    const result: UpdatableBookFields = {};
    for (const field of UPDATABLE_BOOK_FIELDS) {
        if (body[field] !== undefined) result[field] = String(body[field]);
    }
    return result;
}

app.patch('/api/books/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    let updateData = pickUpdatableFields(req.body || {});
    try {
        // If coverUrl is provided and it's a remote URL, cache it locally
        if (updateData.coverUrl && updateData.coverUrl.startsWith('http')) {
            console.log(`📥 Starting cover download for book ${id} from: ${updateData.coverUrl}`);
            try {
                updateData.coverUrl = await downloadCover(updateData.coverUrl, Number(id));
                console.log(`✅ Download finished for book ${id}. New path: ${updateData.coverUrl}`);
            } catch (dlError: any) {
                return res.status(400).json({ error: `Could not fetch cover image: ${dlError.message || 'download failed'}` });
            }
        }

        const updatedBook = await prisma.book.update({
            where: { id: Number(id) },
            data: updateData
        });

        // Trigger embedding update if title or description changed
        if (updateData.title !== undefined || updateData.description !== undefined) {
            try {
                const textToEmbed = `${updatedBook.title} ${updatedBook.description || ''}`;
                const embeddingGemma = await EmbeddingService.generateGemmaEmbedding(textToEmbed);

                await prisma.$executeRaw`
                    UPDATE "Book"
                    SET "embeddingGemma" = ${`[${embeddingGemma.join(',')}]`}::vector
                    WHERE "id" = ${updatedBook.id}
                `;
                console.log(`✅ Embeddings updated for: ${updatedBook.title}`);
            } catch (embError) {
                console.error(`❌ Error updating embedding for: ${updatedBook.title}`, embError);
            }
        }

        res.json(updatedBook);

    } catch (error: any) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Book not found' });
        }
        res.status(500).json({ error: 'Error during update' });
    }
});

// New public route to get all catalogue with pagination
// GET /app/books?page=1&limit=10
// GET /app/books?search=Harry

/**
 * @swagger
 * /api/catalog:
 *   get:
 *     summary: Public catalog with pagination
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of books with pagination info
 */
app.get('/api/catalog', async (req, res) => {
    try {
        // Reading params with default values
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const search = req.query.search as string;

        // calculate how many elements to skip
        const skip = (page - 1) * limit;

        // build search filter
        // search word in title or author
        const whereCondition = search ? {
            OR: [
                { title: { contains: search, mode: 'insensitive' as const } },
                { author: { contains: search, mode: 'insensitive' as const } }
            ]
        } : {};

        // execute query with pagination
        let books;
        let total;

        if (search) {
            [books, total] = await Promise.all([
                prisma.$queryRaw`
                    SELECT * FROM "Book"
                    WHERE to_tsvector('simple', "title" || ' ' || "author") @@ websearch_to_tsquery('simple', ${search})
                    ORDER BY ts_rank(to_tsvector('simple', "title" || ' ' || "author"), websearch_to_tsquery('simple', ${search})) DESC
                    LIMIT ${limit} OFFSET ${skip};
                `,
                prisma.$queryRaw<{ count: bigint }[]>`
                    SELECT COUNT(*) as count FROM "Book"
                    WHERE to_tsvector('simple', "title" || ' ' || "author") @@ websearch_to_tsquery('simple', ${search})
                `.then(res => Number(res[0]?.count || 0))
            ]);
        } else {
            [books, total] = await Promise.all([
                prisma.book.findMany({
                    where: whereCondition,
                    skip: skip,
                    take: limit,
                    orderBy: { title: 'asc' }
                }),
                prisma.book.count({ where: whereCondition })
            ]);
        }

        // return data + pagination metadata
        res.json({
            data: books,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error retrieving books' });
    }

});

/**
 * @swagger
 * /api/search/similar:
 *   get:
 *     summary: Search books by semantic similarity
 *     description: Converts the query into a Gemma embedding and finds the most similar books using vector distance.
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: The search phrase (e.g., "books about space travel")
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *     responses:
 *       200:
 *         description: List of similar books
 *       400:
 *         description: Missing query
 */
app.get('/api/search/similar', async (req, res) => {
    try {
        const { query, limit } = req.query;

        console.log(`🔎 Semantic search for: "${query}"`);

        if (!query) {
            return res.status(400).json({ error: "Query parameter is required" });
        }

        const maxResults = parseInt(limit as string) || 5;
        const embedding = await EmbeddingService.generateGemmaEmbedding(String(query));
        const embeddingString = `[${embedding.join(',')}]`;

        // Perform vector search using cosine distance (<=>)
        const books = await prisma.$queryRaw`
            SELECT "id", "title", "author", "description", "coverUrl",
                   1 - ("embeddingGemma" <=> ${embeddingString}::vector) as similarity
            FROM "Book"
            WHERE "embeddingGemma" IS NOT NULL
            ORDER BY "embeddingGemma" <=> ${embeddingString}::vector ASC
            LIMIT ${maxResults};
        `;

        res.json(books);

    } catch (error) {
        console.error("Error in semantic search:", error);
        res.status(500).json({ error: "Internal server error during search" });
    }
});

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: Login to get a JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful login
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       401:
 *         description: Wrong password
 */
console.log("Configuring route /api/login...");

// Throttle login attempts: 10 tries per IP every 15 minutes, on top of the
// constant-time comparison below, to make brute-forcing ADMIN_PASSWORD
// impractical.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later' },
});

// Constant-time comparison so response timing doesn't leak how many
// characters of the password were correct.
function safeCompare(a: string, b: string): boolean {
    const bufA = crypto.createHash('sha256').update(a).digest();
    const bufB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(bufA, bufB);
}

app.post('/api/login', loginLimiter, (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminPassword && typeof password === 'string' && safeCompare(password, adminPassword)) {
        // Generate token is password is ok
        const token = jwt.sign(
            {
                sub: 'admin',
                iss: 'trnq'
            },
            JWT_SECRET,
            { expiresIn: '24h' } // the token expires every day
        );
        return res.json({ token });
    }

    res.status(401).json({ error: "Wrong password" });
});

app.listen(port, () => {
    console.log(`Server listing on http://localhost:${port}`);
});
