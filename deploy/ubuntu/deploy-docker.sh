#!/usr/bin/env bash
# =============================================================================
# Kịch bản triển khai & cập nhật trên Ubuntu Server (Dùng Docker Compose)
# Cách chạy: bash deploy/ubuntu/deploy-docker.sh
# =============================================================================

set -e

echo "🚀 [1/5] Kéo mã nguồn mới nhất từ Git..."
git pull origin develop || git pull

echo "📦 [2/5] Kiểm tra cấu hình môi trường (.env)..."
if [ ! -f "backend/.env" ]; then
    echo "⚠️ Chưa tìm thấy file backend/.env. Đang tạo từ .env.example..."
    cp backend/.env.example backend/.env
    echo "❗ Vui lòng chỉnh sửa backend/.env với các thông số bảo mật trước khi tiếp tục!"
fi

echo "🐳 [3/5] Build và khởi chạy Docker containers (Backend + Gotenberg)..."
docker compose down || true
docker compose up -d --build

echo "🔍 [4/5] Kiểm tra trạng thái containers..."
docker compose ps

echo "✅ [5/5] Triển khai thành công!"
echo "Ứng dụng đang chạy tại: http://localhost:9000 (hoặc qua domain cấu hình Nginx)"
