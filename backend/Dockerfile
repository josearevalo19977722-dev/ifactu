# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Instalar solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar build
COPY --from=builder /app/dist ./dist

# Crear directorios necesarios para uploads y certificados
RUN mkdir -p uploads/certs uploads/logo certificados certs

EXPOSE 3002
CMD ["node", "dist/main"]
