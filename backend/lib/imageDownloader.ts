import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * Downloads an image from a URL and saves it to the local public/covers folder.
 * @param url The remote image URL.
 * @param bookId The ID of the book to use as the filename.
 * @returns The relative path to the saved image (e.g., /covers/123.jpg).
 */
export async function downloadCover(url: string, bookId: number): Promise<string> {
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 10000,
        });

        const publicPath = path.join(__dirname, '..', 'public', 'covers');
        if (!fs.existsSync(publicPath)) {
            fs.mkdirSync(publicPath, { recursive: true });
        }

        const fileName = `${bookId}.jpg`;
        const filePath = path.join(publicPath, fileName);
        const writer = fs.createWriteStream(filePath);

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(`/covers/${fileName}`));
            writer.on('error', (err) => {
                console.error(`❌ Error writing image for book ${bookId}:`, err);
                reject(url); // Fallback to original URL if download fails
            });
        });
    } catch (error) {
        console.error(`❌ Error downloading image for book ${bookId}:`, error);
        return url; // Fallback to original URL
    }
}
