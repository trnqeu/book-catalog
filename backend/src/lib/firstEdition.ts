import axios, { AxiosError } from 'axios';

// Looks up the year a work was first published, independently of the
// specific edition stored in the catalog (Google Books' `publishedDate` is
// usually the e-book edition date).
//
// Both sources are queried and the oldest plausible year wins:
// - Open Library groups editions into "works" with a `first_publish_year`,
//   but translations are often separate works (e.g. the Italian "Sonata a
//   Kreutzer" is dated 2009), so on its own it under-reports classics.
// - Wikidata models the original work (P577 publication date) and its
//   search matches translated labels, so it fixes exactly those cases.

export type FirstEditionSource = 'openlibrary' | 'wikidata';

export interface FirstEditionResult {
    year: number;
    source: FirstEditionSource;
}

const USER_AGENT = 'book-catalog-enricher/1.0 (personal book catalog)';
const HTTP_TIMEOUT_MS = 20_000;
const MIN_YEAR = -3000;

// --- Normalization ---------------------------------------------------------

/** "Sonata a Kreutzer (Italian Edition)" -> "Sonata a Kreutzer". */
export function stripEditionNotes(title: string): string {
    return title
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Titles to try, most specific first: the full title (so "Exodus: The
 * Archimedes Engine" doesn't match an unrelated "Exodus"), then the title
 * without its subtitle (Italian e-books often carry marketing subtitles).
 */
export function titleVariants(title: string): string[] {
    const full = stripEditionNotes(title);
    const main = (full.split(/[:–—]| - /)[0] ?? '').trim();
    return [...new Set([full, main])].filter(Boolean);
}

// Role words and titles that end up in author fields ("A cura di N.K.
// Sandars", "Ivo author Pinto", "Dr Logan Song").
const AUTHOR_NOISE = /\b(a cura di|edited by|translated by|introduction by|author|editor|curatore|ed\.|dr\.?|prof\.?)(?=\s|$)/gi;

/**
 * Handles both catalog formats:
 *   "Tolstoj, Lev Nikolaevic"              -> "Lev Nikolaevic Tolstoj" / "Tolstoj"
 *   "Boris Strugackij, Arkadij Strugackij" -> "Boris Strugackij" / "Strugackij"
 * A comma means "Surname, Given" only when the part before it is a single
 * word; otherwise it separates co-authors and the first one is used.
 */
export function normalizeAuthor(author: string): { full: string; surname: string } {
    const cleaned = author.replace(AUTHOR_NOISE, ' ').replace(/\s+/g, ' ').trim();
    let first = (cleaned.split(/;|&| and | e /)[0] ?? cleaned).trim();

    const commaParts = first.split(',').map(s => s.trim()).filter(Boolean);
    if (commaParts.length >= 2 && commaParts[0]!.split(/\s+/).length === 1) {
        const [surname = '', given = ''] = commaParts;
        return { full: `${given} ${surname}`.trim(), surname };
    }
    first = commaParts[0] ?? first;
    const words = first.split(/\s+/);
    return { full: first, surname: words[words.length - 1] ?? first };
}

/** Lowercase, strip accents and punctuation, for fuzzy comparisons. */
function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N} ]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Surname transliterations differ ("Tolstoj" / "Tolstoy", "Strugackij" /
 * "Strugatsky"), so compare on the first 5 letters of the surname's last
 * word ("O'Hagan" folds to "o hagan" -> "hagan"). The candidates already
 * matched the title, so this loose check is enough to reject other authors.
 */
function authorMatches(candidate: string, surname: string): boolean {
    const words = fold(surname).split(' ');
    const last = words[words.length - 1] ?? '';
    if (!last) return false;
    const stem = last.slice(0, 5);
    return fold(candidate).split(' ').some(word => word.startsWith(stem));
}

function titleMatches(candidate: string, query: string): boolean {
    const c = fold(candidate);
    const q = fold(query);
    return c === q || c.startsWith(q) || q.startsWith(c);
}

function isPlausibleYear(year: unknown): year is number {
    return typeof year === 'number'
        && Number.isInteger(year)
        && year >= MIN_YEAR
        && year <= new Date().getFullYear();
}

// --- HTTP with backoff -------------------------------------------------------

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getWithRetry<T>(url: string, params: Record<string, string>, headers: Record<string, string> = {}): Promise<T> {
    let wait = 5_000;
    for (let attempt = 1; ; attempt++) {
        try {
            const res = await axios.get<T>(url, {
                params,
                headers: { 'User-Agent': USER_AGENT, ...headers },
                timeout: HTTP_TIMEOUT_MS,
            });
            return res.data;
        } catch (err) {
            const status = (err as AxiosError).response?.status;
            const retriable = status === undefined || status === 429 || status >= 500;
            if (!retriable || attempt >= 4) throw err;
            const retryAfter = Number((err as AxiosError).response?.headers?.['retry-after']);
            await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : wait);
            wait *= 2;
        }
    }
}

// --- Open Library ------------------------------------------------------------

interface OpenLibraryDoc {
    title?: string;
    author_name?: string[];
    first_publish_year?: number;
}

export async function lookupOpenLibrary(title: string, author: string): Promise<number | null> {
    const { full, surname } = normalizeAuthor(author);
    const data = await getWithRetry<{ docs?: OpenLibraryDoc[] }>('https://openlibrary.org/search.json', {
        title,
        author: full,
        fields: 'title,author_name,first_publish_year',
        limit: '10',
    });

    const years = (data.docs ?? [])
        .filter(d => d.title && titleMatches(d.title, title))
        .filter(d => (d.author_name ?? []).some(a => authorMatches(a, surname)))
        .map(d => d.first_publish_year)
        .filter(isPlausibleYear);

    return years.length ? Math.min(...years) : null;
}

// --- Wikidata ----------------------------------------------------------------

function sparqlString(s: string): string {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
}

export async function lookupWikidata(title: string, author: string, language = 'it'): Promise<number | null> {
    const { surname } = normalizeAuthor(author);
    const lang = /^[a-z]{2}$/.test(language) ? language : 'it';

    // EntitySearch matches labels and aliases in any language, then we keep
    // only items whose author (P50) label contains the surname.
    const query = `
        SELECT ?item ?authorLabel (MIN(YEAR(?date)) AS ?year) WHERE {
          SERVICE wikibase:mwapi {
            bd:serviceParam wikibase:endpoint "www.wikidata.org";
                            wikibase:api "EntitySearch";
                            mwapi:search ${sparqlString(title)};
                            mwapi:language "${lang}";
                            mwapi:limit "10".
            ?item wikibase:apiOutputItem mwapi:item.
          }
          ?item wdt:P50 ?author .
          # Only the work's own publication date: inception (P571) is the
          # writing date, and the oldest edition (P747) is often a later one.
          ?item wdt:P577 ?date .
          ?author rdfs:label ?authorLabel .
        }
        GROUP BY ?item ?authorLabel
    `;

    const data = await getWithRetry<{ results: { bindings: Array<Record<string, { value: string }>> } }>(
        'https://query.wikidata.org/sparql',
        { query },
        { Accept: 'application/sparql-results+json' },
    );

    const years = data.results.bindings
        .filter(b => b.authorLabel && authorMatches(b.authorLabel.value, surname))
        .map(b => Number(b.year?.value))
        .filter(isPlausibleYear);

    return years.length ? Math.min(...years) : null;
}

// --- Combined ----------------------------------------------------------------

/** Extracts a year from Google Books' `publishedDate` ("2014", "2014-03-01"), if any. */
export function yearFromPublishedDate(publishedDate: string | null | undefined): number | null {
    const match = publishedDate?.match(/^(-?\d{3,4})/);
    const year = match ? Number(match[1]) : null;
    return isPlausibleYear(year) ? year : null;
}

export async function findFirstEditionYear(book: {
    title: string;
    author: string;
    language?: string | null;
}): Promise<FirstEditionResult | null> {
    const variants = titleVariants(book.title);
    if (!variants.length || !book.author) return null;

    const sources: Array<[FirstEditionSource, (title: string) => Promise<number | null>]> = [
        ['openlibrary', t => lookupOpenLibrary(t, book.author)],
        ['wikidata', t => lookupWikidata(t, book.author, book.language ?? 'it')],
    ];

    const candidates: FirstEditionResult[] = [];
    for (const [source, lookup] of sources) {
        // Per source, stop at the first title variant that yields a match.
        for (const title of variants) {
            try {
                const year = await lookup(title);
                if (year !== null) {
                    candidates.push({ year, source });
                    break;
                }
            } catch (err) {
                console.error(`${source} lookup failed for "${title}":`, (err as Error).message);
            }
        }
    }

    if (!candidates.length) return null;
    return candidates.reduce((oldest, c) => (c.year < oldest.year ? c : oldest));
}
