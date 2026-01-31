# 📚 Book Catalog API

A robust, containerized Node.js backend for managing a personal book catalog, featuring automated data enrichment via the Google Books API and secure JWT-based authentication.

---

## 🚀 Features

-   **Comprehensive Book Management**: Create, list, search, and detail views for your library.
-   **Smart Enrichment**: Automatically fetches descriptions, cover images, and publication details using the **Google Books API**.
-   **Bulk Import**: Quickly seed your database from existing text-based lists.
-   **Secure by Design**: Protected endpoints using **JWT (JSON Web Tokens)**.
-   **Interactive API Docs**: Built-in **Swagger UI** for testing and exploration.
-   **Containerized Environment**: Easy deployment and development using **Docker** and **Docker Compose**.
-   **Type-Safe Architecture**: Built with **TypeScript** and **Prisma ORM** for maximum reliability.

---

## 🛠 Technology Stack

-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **Framework**: [Express.js](https://expressjs.com/)
-   **Database**: [PostgreSQL](https://www.postgresql.org/)
-   **ORM**: [Prisma](https://www.prisma.io/)
-   **Documentation**: [Swagger / OpenAPI 3.0](https://swagger.io/)
-   **Containerization**: [Docker](https://www.docker.com/)

---

## 📂 Project Structure

```bash
.
├── .github/workflows/    # CI/CD - Automated SSH deployment
├── backend/
│   ├── data/             # Seeding source files
│   ├── prisma/           # Database schema & migrations
│   ├── server.ts         # Main entry point & API routes
│   ├── importEbooks.ts   # Bulk import utility
│   └── enrichBooks.ts    # Google Books enrichment script
├── docker-compose.yml    # Orchestrates PG and Adminer
└── README.md
```

---

## 🚦 Getting Started

### 1. Prerequisites
- Docker & Docker Compose
- Node.js (v20+ recommended)

### 2. Environment Setup
Create a `.env` file in the root directory (and ensure `backend/.env` is also present if running locally without Docker):

```env
DATABASE_URL="postgresql://user:password@localhost:5432/book_catalog"
JWT_SECRET="your_very_secret_key"
ADMIN_PASSWORD="your_admin_access_password"
PORT=3000
```

### 3. Installation & Database Setup
```bash
# Start infrastructure
docker-compose up -d

# Install dependencies (in /backend)
cd backend
npm install

# Initialize database
npx prisma migrate dev
```

---

## 📖 Usage

### Running Locally
- **Development**: `npm run dev` (with hot-reloading via `tsx`)
- **Productionize**: `npm start`

### Seeding Data
1. Place a text file in `backend/data/catalogo-ebook.txt`.
2. Run the import script: `npx tsx importEbooks.ts`
3. Enrich the data: `npx tsx enrichBooks.ts`

---

## 🔌 API Documentation

Once the server is running, access the interactive documentation at:
👉 **[http://localhost:3000/api-docs](http://localhost:3000/api-docs)**

### Key Endpoints
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/login` | Exchange password for JWT | No |
| `GET` | `/api/books` | List books (supports `search`, `author`) | Yes |
| `GET` | `/app/books/:id`| Get book details | No |
| `POST` | `/api/books` | Manual book entry | Yes |

---

## 🚢 Deployment

This project includes a **GitHub Actions** workflow for automated deployment.
- **Triggers**: On push to `main` branch.
- **Process**: Code checkout → SSH to server → `git pull` → `docker compose up --build`.

**Required GitHub Secrets:**
- `SERVER_IP`, `SERVER_USER`, `SSH_PRIVATE_KEY`

---

## 🗺 Roadmap

Current development focus:
- [ ] **Semantic Search**: Implementing vector embeddings for better discovery (multilingual).
- [ ] **Vector Database Integration**: Migration to a vector-capable store.
- [ ] **Frontend**: Developing a React/Next.js dashboard.


