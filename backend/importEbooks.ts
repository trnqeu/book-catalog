import 'dotenv/config';
// import { PrismaClient } from './generated/prisma/client.js';
import { PrismaClient } from './prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg';
import fs from 'fs';

const connectionString = "postgresql://joaomastino:S4cr4m3n70!@127.0.0.1:5432/book_catalog?schema=public";
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const fileContent = fs.readFileSync('./data/catalogo-ebook.txt', 'utf-8');
    const lines = fileContent.split('\n').map(l => l.trim());

    console.log(`🚀 Analisi iniziata su ${lines.length} righe.`);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 1. SALTO ESTRATTI (Blocco di 3: ESTRATTO + Titolo + Autore)
        if (line.toUpperCase().includes("ESTRATTO")) {
            console.log(`⚠️ Salto blocco ESTRATTO...`);
            let skipped = 0;
            let j = i + 1;
            while (skipped < 2 && j < lines.length) {
                if (lines[j] !== "") skipped++;
                j++;
            }
            i = j - 1;
            continue;
        }

        // 2. SALTO RIGHE VUOTE O RUMORE
        if (!line || line === "Prime Reading") continue;

        // 3. IDENTIFICAZIONE COPPIA
        let title = line;
        let author = "";

        let k = i + 1;
        while (k < lines.length) {
            const nextLine = lines[k].trim();
            if (nextLine === "Prime Reading") {
                k++;
                continue;
            }
            if (nextLine !== "") {
                author = nextLine;
                i = k; 
                break;
            }
            k++;
        }

        if (title && author) {
            // Risoluzione TS2375: garantiamo che language sia string
            const langMatch = title.match(/\(([^)]*?)\s*Edition\)/i);
            const language: string = langMatch ? langMatch[1] : 'Italian'; 
            
            const cleanTitle = title.replace(/\([^)]*?\s*Edition\)/i, '').trim();

            try {
                await prisma.book.create({
                    data: {
                        title: cleanTitle,
                        author: author,
                        language: language, // Ora è sicuramente una stringa
                        format: 'Ebook',
                        publishingHouse: 'Unknown'
                    }
                });
                console.log(`✅ [LIBRO] ${cleanTitle.substring(0, 40)}...`);
            } catch (error) {
                console.error(`❌ Errore database su: ${cleanTitle}`);
            }
        }
    } // Fine ciclo for
}

main()
    .catch(e => console.error("❌ Errore fatale:", e))
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });