# =============================================================================
# Kịch bản triển khai & cập nhật trên Windows Server (PowerShell)
# Yêu cầu: Node.js 20+, Git, PM2 (npm install -g pm2)
# Cách chạy: powershell -ExecutionPolicy Bypass -File deploy\windows\deploy-pm2.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host "🚀 [1/5] Kéo mã nguồn mới nhất từ Git..." -ForegroundColor Cyan
git pull origin develop

Write-Host "📦 [2/5] Cài đặt dependencies (Workspaces)..." -ForegroundColor Cyan
npm install

Write-Host "🛠️ [3/5] Áp dụng migrations database..." -ForegroundColor Cyan
Set-Location backend
npx prisma generate
npx prisma migrate deploy
Set-Location ..

Write-Host "🏗️ [4/5] Biên dịch toàn bộ Frontend và Backend..." -ForegroundColor Cyan
npm run build

Write-Host "🔄 [5/5] Khởi động lại ứng dụng qua PM2..." -ForegroundColor Cyan
$pm2App = pm2 list | Select-String "invoice-backend"
if ($pm2App) {
    pm2 restart invoice-backend --update-env
} else {
    pm2 start backend/dist/src/main.js --name "invoice-backend" --time
    pm2 save
}

Write-Host "✅ Triển khai hoàn tất thành công!" -ForegroundColor Green
pm2 status
