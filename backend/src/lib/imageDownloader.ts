import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dns from 'dns/promises';
import net from 'net';

const MAX_COVER_BYTES = 8 * 1024 * 1024; // 8MB, generous for a book cover
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Rejects hostnames/IPs that resolve inside private, loopback, link-local
 * or other non-public ranges, so a caller can't point us at internal
 * infrastructure (Docker network services, cloud metadata endpoints, etc).
 */
function isPrivateOrReservedIp(ip: string): boolean {
    const family = net.isIP(ip);
    if (family === 4) {
        const octets = ip.split('.').map(Number);
        const a = octets[0] ?? 0;
        const b = octets[1] ?? 0;
        return (
            a === 10 ||
            a === 127 ||
            (a === 169 && b === 254) || // link-local incl. cloud metadata
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            a === 0 ||
            a >= 224 // multicast/reserved
        );
    }
    if (family === 6) {
        const lower = ip.toLowerCase();
        return (
            lower === '::1' ||
            lower.startsWith('fe80:') || // link-local
            lower.startsWith('fc') || lower.startsWith('fd') || // unique local
            lower.startsWith('::ffff:127.') // IPv4-mapped loopback
        );
    }
    return true; // unknown family: fail closed
}

async function assertPublicUrl(rawUrl: string): Promise<URL> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new Error('Invalid cover URL');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`Unsupported protocol for cover URL: ${url.protocol}`);
    }

    const literalIp = net.isIP(url.hostname) ? url.hostname : null;
    const addresses = literalIp
        ? [literalIp]
        : (await dns.lookup(url.hostname, { all: true })).map(a => a.address);

    if (addresses.length === 0 || addresses.some(isPrivateOrReservedIp)) {
        throw new Error('Cover URL resolves to a private or reserved address');
    }

    return url;
}

/**
 * Downloads an image from a URL and saves it to the local public/covers folder.
 * @param url The remote image URL.
 * @param bookId The ID of the book to use as the filename.
 * @returns The relative path to the saved image (e.g., /covers/123.jpg).
 */
export async function downloadCover(url: string, bookId: number): Promise<string> {
    try {
        await assertPublicUrl(url);

        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 10000,
            maxRedirects: 3,
            maxContentLength: MAX_COVER_BYTES,
        });

        const contentType = (String(response.headers['content-type'] || '').split(';')[0] || '').trim();
        if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
            response.data.destroy();
            throw new Error(`Rejected cover with content-type: ${contentType || 'unknown'}`);
        }

        const publicPath = path.join(process.cwd(), 'public', 'covers');
        if (!fs.existsSync(publicPath)) {
            console.log(`📁 Creating directory: ${publicPath}`);
            fs.mkdirSync(publicPath, { recursive: true });
        }

        const fileName = `${bookId}.jpg`;
        const filePath = path.join(publicPath, fileName);
        console.log(`💾 Writing image to: ${filePath}`);
        const writer = fs.createWriteStream(filePath);

        let bytesWritten = 0;
        response.data.on('data', (chunk: Buffer) => {
            bytesWritten += chunk.length;
            if (bytesWritten > MAX_COVER_BYTES) {
                response.data.destroy();
                writer.destroy(new Error('Cover exceeds maximum allowed size'));
            }
        });
        response.data.pipe(writer);

        return await new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log(`✨ File ${fileName} successfully written to disk.`);
                resolve(`/covers/${fileName}`);
            });
            writer.on('error', (err) => {
                console.error(`❌ Error writing image for book ${bookId}:`, err);
                fs.promises.unlink(filePath).catch(() => {});
                reject(err);
            });
        });
    } catch (error) {
        console.error(`❌ Error downloading image for book ${bookId}:`, error);
        // Do not fall back to the original (unvalidated) URL: that would
        // reintroduce SSRF risk one layer up by storing an attacker URL as
        // the book's coverUrl. Callers should keep whatever cover was set
        // before this call.
        throw error;
    }
}
