#!/bin/bash
set -e

REPO_DIR="/opt/ifactu"
FRONTEND_DIR="$REPO_DIR/frontend"
BACKEND_DIR="$REPO_DIR/backend"

echo ""
echo "┌─────────────────────────────────────┐"
echo "│        Deploy iFactu — iFactu SV    │"
echo "└─────────────────────────────────────┘"
echo ""

# ── 1. Pull código más reciente ──────────────────────────────────────────────
echo "📥 [1/4] Actualizando código desde GitHub..."
cd "$REPO_DIR"
git pull origin main
echo "✅ Código actualizado"

# ── 2. Build y restart backend ────────────────────────────────────────────────
echo ""
echo "🐳 [2/4] Construyendo y reiniciando backend..."
docker compose up -d --build
echo "✅ Backend actualizado"

# ── 3. Build frontend ─────────────────────────────────────────────────────────
echo ""
echo "⚛️  [3/4] Compilando frontend..."
cd "$FRONTEND_DIR"
npm ci --silent
npm run build
echo "✅ Frontend compilado"

# ── 4. Reload nginx ───────────────────────────────────────────────────────────
echo ""
echo "🌐 [4/4] Recargando Nginx..."
nginx -t && systemctl reload nginx
echo "✅ Nginx recargado"

echo ""
echo "┌─────────────────────────────────────┐"
echo "│   ✅ Deploy completado exitosamente  │"
echo "└─────────────────────────────────────┘"
echo ""
