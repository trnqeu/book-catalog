import "dotenv/config";
import { PrismaClient } from '../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { findFirstEditionYear, yearFromPublishedDate } from '../src/lib/firstEdition';

// Fills Book.firstPublishedYear for every book not looked up yet.
//
// Usage:
//   npm run enrich:first-edition                      # all pending books
//   npm run enrich:first-edition -- --dry-run         # print matches, write nothing
//   npm run enrich:first-edition -- --limit 50        # stop after 50 books
//   npm run enrich:first-edition -- --retry-not-found # also retry "not_found" ones
//
// Resumable: progress is stored per book in firstPublishedSource, so the
// script can be interrupted and re-run at any time.

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RETRY_NOT_FOUND = args.includes('--retry-not-found');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

const BATCH_SIZE = 100;
// Politeness delay between books (each book costs 2–4 requests).
const DELAY_MS = 1000;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function enrich() {
    const sourceFilter = RETRY_NOT_FOUND
        ? { OR: [{ firstPublishedSource: null }, { firstPublishedSource: 'not_found' }] }
        : { firstPublishedSource: null };

    const stats = { openlibrary: 0, wikidata: 0, googlebooks: 0, not_found: 0, errors: 0 };
    let processed = 0;
    let lastId = 0;

    const total = await prisma.book.count({ where: sourceFilter });
    console.log(`📚 ${total} books to process${DRY_RUN ? ' (dry run)' : ''}`);

    while (processed < LIMIT) {
        // Paginate by id so books updated in this run (or skipped in dry run)
        // are never fetched twice.
        const books = await prisma.book.findMany({
            where: { ...sourceFilter, id: { gt: lastId } },
            select: { id: true, title: true, author: true, language: true, publishedDate: true },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
        });
        if (!books.length) break;

        for (const book of books) {
            if (processed >= LIMIT) break;
            lastId = book.id;
            processed++;

            try {
                const found = await findFirstEditionYear(book);
                const editionYear = yearFromPublishedDate(book.publishedDate);

                let year: number | null = found?.year ?? null;
                let source: string = found?.source ?? 'not_found';

                // The edition we own is an upper bound: the work can't have
                // been first published after it.
                if (year !== null && editionYear !== null && editionYear < year) {
                    year = editionYear;
                    source = 'googlebooks';
                }

                stats[source as keyof typeof stats]++;
                const label = year !== null ? `${year} (${source})` : 'not found';
                console.log(`[${processed}/${Math.min(total, LIMIT)}] ${year !== null ? '✅' : '⚠️ '} ${book.title} — ${book.author}: ${label}`);

                if (!DRY_RUN) {
                    await prisma.book.update({
                        where: { id: book.id },
                        data: { firstPublishedYear: year, firstPublishedSource: source },
                    });
                }
            } catch (error) {
                // Leave firstPublishedSource NULL so the book is retried next run.
                stats.errors++;
                console.error(`❌ Error on "${book.title}":`, (error as Error).message);
            }

            await delay(DELAY_MS);
        }
    }

    console.log('\n📊 Summary');
    console.table(stats);
}

enrich().finally(() => {
    prisma.$disconnect();
    pool.end();
});
