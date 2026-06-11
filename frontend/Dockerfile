# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Serve con Nginx ──────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# Configuración nginx para SPA (React Router) con cache correcto
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    # index.html NUNCA se cachea — siempre sirve el build más reciente \
    location = /index.html { \
        add_header Cache-Control "no-cache, no-store, must-revalidate"; \
        add_header Pragma "no-cache"; \
        add_header Expires "0"; \
    } \
    \
    # Assets con hash de contenido (JS/CSS) pueden cachearse 1 año \
    location /assets/ { \
        add_header Cache-Control "public, max-age=31536000, immutable"; \
    } \
    \
    # SPA fallback para React Router \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
