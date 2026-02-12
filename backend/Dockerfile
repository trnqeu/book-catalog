FROM node:22-slim

# Install dependencies for Prisma and PostgresSQL
RUN apt-get update && apt-get install -y openssl libpq-dev

WORKDIR /app

COPY package*.json ./
RUN npm install

# Copy Prisma schema and generates client
COPY prisma ./prisma/
RUN npx prisma generate

COPY . .
RUN mkdir -p public/covers


EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
