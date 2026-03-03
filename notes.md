Per lanciare il container con il db:

```
docker compose up -d
```


Installazione Typescript
```
cd backend
npm init -y
npm install typescript ts-node @types/node --save-dev
npx tsc --init
```

Installazoine Prisma e Dotenv
```
npm install express @prisma/client dotenv
npm install @types/express prisma --save-dev

npm install prisma @types/node @types/pg --save-dev 
npm install @prisma/client @prisma/adapter-pg pg dotenv


```

Inizializza Prisma e crea le cartelle con gli schemi:

```
npx prisma init
```

Dopo la configurazione di Prisma

```
npx prisma migrate dev --name init
```

```
npx tsx importBooks.ts

```

Pulitura database

```
docker exec -it book_db psql -U joaomastino -d book_catalog -c "TRUNCATE TABLE \"Book\";"
```

Install express

```
npm install express cors
npm install -D @types/express @types/cors
```

Install Axios to make http requests to Google Books

```
npm install axios
npm install -D @types/axios
```

Lancia lo script per l'arricchimento con Google Books:

```
npx tsx enrichBooks.ts

```

Per sapere quanti sono ancora i libri non arricchiti:

```
docker exec -it book_db psql -U joaomastino -d book_catalog -c "SELECT COUNT(*) FROM \"Book\" WHERE description IS NOT NULL;"
```

Installa JWT

```
npm install jsonwebtoken
npm install @types/jsonwebtoken --save-dev
```

Genera token JWT:

```
node -e "console.log(require('jsonwebtoken').sign({ sub: 'YOUR_SUB', iss: 'YOUR_ISS' }, 'YOUR_SECRET_KEY'))"


```

Per testare il funzionamento con il token:

```
curl -i -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhc3Ryby1ib29rcyIsImlzcyI6InRybnEiLCJpYXQiOjE3NjkwNTc5NjB9.jAs7jzAVLas_fJ3xHUsK6r91cC2YGTQSFihQ-d-Z_TU" http://localhost:3000/api/books

```

Allineare le tabelle di Prisma:

```
docker exec -it book_api npx prisma db push
```


Eseguire l'arricchimento sul server via Docker:
```
docker exec -it book_api npx tsx enrichBooks.ts
```

Eseguire la migrazione alle copertine ad alta risoluzione:
```
docker exec -it book_api npx tsx scripts/updateExistingCovers.ts
```

## Database Backup Strategy

We have implemented a script to back up the PostgreSQL database running in Docker.

### 📄 Backup Script
The script is located at `scripts/backup_db.sh`. It performs the following:
1. Loads DB credentials from the root `.env` file.
2. Runs `pg_dump` inside the `book_db` container.
3. Saves a compressed `.sql.gz` file in the `backups/` directory.
4. Automatically deletes backups older than 30 days.

To run it manually:
```bash
./scripts/backup_db.sh
```

### 🕒 Automation (Cron Job)
To automate the backup (e.g., every day at 3:00 AM), add a entry to your crontab:
1. Run `crontab -e`.
2. Add the following line (adjusting the path to your project):
```bash
0 3 * * * cd /home/stefano/Documents/Progetti/book-catalog && ./scripts/backup_db.sh
```

### ⚠️ Off-site Backup
**IMPORTANT**: These backups are currently stored on the same server. For real security, you should copy the `backups/` folder to a remote storage (S3, Dropbox, another server, etc.) periodically.

### Adminer
Tunnel per accedere a Postgres dal mio IP:
```
ssh -L 9000:127.0.0.1:8081 joaomastino@135.181.201.152

Poi: http://localhost:9000/

```


### Swagger

Installazione dipendenze:

```
npm install swagger-ui-express swagger-jsdoc
npm install --save-dev @types/nswagger-ui-express @types/swagger-jsdoc
```
Per vedere la documentazione: https://book-api.trnq.eu/api-docs

### EmbeddingGemma

Per migliorare la qualità della ricerca semantica, è consigliato l'uso di **EmbeddingGemma** (768 dimensioni). Il modello deve essere ospitato localmente tramite [Ollama](https://ollama.com/).

Comando per scaricare il modello sul server:
```bash
ollama pull embedding-gemma
```

In Prisma, la colonna deve essere definita come `Unsupported("vector(768)")`. Per generare gli embedding, inviare una richiesta POST all'endpoint `/api/embeddings` di Ollama:
```bash
curl http://localhost:11434/api/embeddings -d '{
  "model": "embedding-gemma",
  "prompt": "Testo da embeddare"
}'
```

TO DO:
[x] database vettoriale
[x] embedding
[x] EmbeddingGemma integration (768 dims)
[x] similarity search
[x] ricerca semantica
[ ] similarità dei libri
