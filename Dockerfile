FROM node:20-slim AS builder

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json* ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

# Install dependencies for the whole workspace. Puppeteer needs unzip to extract Chrome, Prisma needs openssl
RUN apt-get update && apt-get install -y unzip openssl && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_CACHE_DIR=/app/.puppeteer-cache
RUN npm install

# Copy source code
COPY . .

# Build backend, frontend, and copy frontend to backend/public
RUN npm run build


# Stage 2: Production
FROM node:20-slim AS runner

# Install Puppeteer dependencies
# (We need these libraries to run Headless Chrome on Debian/Ubuntu slim)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libexpat1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libxcb1 \
    libx11-xcb1 \
    libx11-6 \
    libglib2.0-0 \
    fonts-liberation \
    openssl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the build artifacts and node_modules from builder
# We just need the backend folder since frontend is copied into backend/public
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/public ./backend/public
COPY --from=builder /app/backend/node_module[s] ./backend/node_modules/
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/backend/prisma ./backend/prisma

# We also need the root node_modules for hoisted dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.puppeteer-cache /app/.puppeteer-cache

ENV PUPPETEER_CACHE_DIR=/app/.puppeteer-cache

WORKDIR /app/backend

# Create a directory for sqlite db and invoices
RUN mkdir -p /app/data
ENV DATABASE_URL="file:/app/data/database.db"
ENV INVOICES_DIR="/app/data/invoices"
ENV PORT=3000
ENV NODE_ENV=production
ENV TZ=Asia/Ho_Chi_Minh

EXPOSE 3000

# Start the application using the pre-built server.cjs
CMD ["npm", "run", "production"]
