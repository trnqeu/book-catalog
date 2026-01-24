# Book Catalog

This project is a simple book catalog application with a Node.js backend and a PostgreSQL database.

## Features

-   List and search for books
-   Add new books
-   User authentication with JWT
-   Import books from a text file
-   Enrich book data using the Google Books API

## Technology Stack

-   **Backend**: Node.js, Express.js, TypeScript
-   **Database**: PostgreSQL
-   **ORM**: Prisma
-   **Containerization**: Docker

## Project Structure

```
.
├── .github/                # GitHub Actions workflows
│   └── workflows/
│       └── deploy.yml
├── backend/                # Node.js application
│   ├── data/               # Data files for import
│   ├── lib/                # Prisma client library
│   ├── prisma/             # Prisma schema and migrations
│   ├── Dockerfile
│   ├── enrichBooks.ts      # Script to enrich book data
│   ├── importEbooks.ts     # Script to import books
│   ├── package.json
│   ├── server.ts           # Express server
│   └── tsconfig.json
├── .gitignore
├── docker-compose.yml      # Docker Compose configuration
└── README.md
```

## Getting Started

### Prerequisites

-   Node.js and npm
-   Docker and Docker Compose
-   A `.env` file in the `backend` directory with the following variables:
    ```
    DATABASE_URL="postgresql://<user>:<password>@<host>:<port>/<database>"
    JWT_SECRET="<your_jwt_secret>"
    ADMIN_PASSWORD="<your_admin_password>"
    ```

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/book-catalog.git
    ```
2.  Install the backend dependencies:
    ```bash
    cd book-catalog/backend
    npm install
    ```
3.  Start the database and Adminer using Docker Compose:
    ```bash
    docker-compose up -d
    ```
4.  Apply the database migrations:
    ```bash
    npx prisma migrate dev
    ```

### Running the Application

-   **Development mode**:
    ```bash
    npm run dev
    ```
-   **Production mode**:
    ```bash
    npm start
    ```

## API Endpoints

-   `POST /api/login`: Authenticate and get a JWT token.
-   `GET /api/books`: Get a list of books (requires authentication).
-   `GET /app/books/:id`: Get a single book by ID.
-   `POST /api/books`: Add a new book (requires authentication).

## Scripts

-   `npm run dev`: Start the server in development mode with hot-reloading.
-   `npm start`: Start the server in production mode.
-   `node importEbooks.ts`: Import books from `data/catalogo-ebook.txt`.
-   `node enrichBooks.ts`: Enrich book data using the Google Books API.

## Deployment

This project is configured for continuous deployment using GitHub Actions. A push to the `main` branch will automatically trigger a deployment to the production server.

The deployment workflow consists of the following steps:

1.  **Checkout code**: The workflow checks out the latest code from the `main` branch.
2.  **Deploy to Server via SSH**: The workflow connects to the server via SSH and executes the following commands:
    -   `cd ~/services/book-catalog`: Navigates to the project directory on the server.
    -   `git pull origin main`: Pulls the latest changes from the `main` branch.
    -   `docker compose up -d --build`: Rebuilds and restarts the Docker containers in detached mode.

### GitHub Secrets

The deployment workflow requires the following secrets to be configured in the GitHub repository:

-   `SERVER_IP`: The IP address of the production server.
-   `SERVER_USER`: The username for SSH access to the server.
-   `SSH_PRIVATE_KEY`: The private SSH key for authentication.
