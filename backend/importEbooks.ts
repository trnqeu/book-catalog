import 'dotenv/config';
import { PrismaClient } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg'

import fs from 'fs';

const connectionString = `${process.env.DATABASE_URL}`

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

export { prisma }
// function to read the .txt file
async function main() {

    const fileContent = fs.readFileSync('./data/catalogo-ebook.txt', 'utf-8');

    const lines = fileContent.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    console.log(`Inizio importazione: ${lines.length / 2} libri trovati`);

    for (let i=0; i < lines.length; i += 2) {
        const currentLine = lines[i];

        // skip "estratto"
        if (currentLine?.toUpperCase().includes("ESTRATTO")) {
            console.log(`Salto estratto: ${lines[i+1] ?? 'Titolo non trovato'}`);
            i += 2;
            continue;
        }

        const titleLine = currentLine;
        const author = lines[i + 1];

        if (!titleLine || !author) {
            continue;
        }
        
        i++;

        const langMatch = titleLine.match(/\(([^)]*?)\s*Edition\)/i);
        const language = langMatch ? langMatch[1] : 'Italian';
        const cleanTitle = titleLine.replace(/\([^)]*?\s*Edition\)/i, '').trim()

        try {
            await prisma.book.create({
                data: {
                    title: cleanTitle,
                    author: author,
                    language: language,
                    format: 'Ebook',
                    publishingHouse: 'Unknown'
                }
            });
            console.log(`✅ [Importato] ${cleanTitle}`);
        } catch (error) {
            console.error(`❌ Errore durante l'inserimento di ${cleanTitle}:`, error);
        }


    }
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });