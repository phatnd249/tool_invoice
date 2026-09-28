#!/usr/bin/env bash
# =============================================================================
# Kịch bản triển khai & cập nhật trên Ubuntu Server (Dùng PM2 Native)
# Yêu cầu: Node.js 22 LTS, npm, pm2 đã cài đặt sẵn
# Cách chạy: bash deploy/ubuntu/deploy-pm2.sh
# =============================================================================

set -e

echo "🚀 [1/6] Kéo mã nguồn mới nhất từ Git..."
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
if [ -n "$CURRENT_BRANCH" ]; then
    git pull origin "$CURRENT_BRANCH" || git pull
else
    git pull
fi

echo "📦 [2/6] Cài đặt dependencies (NPM Workspaces)..."
npm install

echo "🛠️ [3/6] Generate Prisma Client & Migrate DB..."
cd backend
npx prisma generate
npx prisma migrate deploy
cd ..

echo "🏗️ [4/6] Biên dịch toàn bộ Frontend và Backend..."
npm run build

echo "📄 [5/6] Đảm bảo Gotenberg (HTML to PDF) đang chạy..."
if ! docker ps | grep -q gotenberg; then
    echo "Khởi động Gotenberg container..."
    docker run -d --name gotenberg --restart unless-stopped -p 3001:3000 gotenberg/gotenberg:8 || true
fi

echo "🔄 [6/6] Khởi động lại ứng dụng qua PM2..."
if pm2 list | grep -q "invoice-backend"; then
    pm2 restart invoice-backend --update-env
else
    pm2 start backend/dist/src/main.js --name "invoice-backend" --time
    pm2 save
fi

echo "✅ Triển khai hoàn tất! PM2 status:"
pm2 status invoice-backend
