# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-slim
WORKDIR /app

# Dependencias del sistema para Chromium (WhatsApp Web / puppeteer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-freefont-ttf \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Instalar solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar build
COPY --from=builder /app/dist ./dist

# Crear directorios necesarios para uploads y certificados
RUN mkdir -p uploads/certs uploads/logo certificados certs

EXPOSE 3002
CMD ["node", "dist/main"]
