#!/usr/bin/env node

/**
 * Helper script để setup Google Drive backup credentials (Google OAuth 2.0)
 * Usage: node scripts/setup-google-drive.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log('\n🔧 Google Drive Backup Setup Helper (Google OAuth 2.0)\n');
  console.log('Công cụ này giúp bạn cấu hình thông tin Google OAuth 2.0 vào file backend/.env.\n');
  console.log('Các bước chuẩn bị:');
  console.log('1. Truy cập https://console.cloud.google.com/apis/credentials');
  console.log('2. Bật Google Drive API trong mục APIs & Services > Library');
  console.log('3. Tạo OAuth Client ID (loại Web Application)');
  console.log('4. Thêm Authorized redirect URI: http://localhost:5173/backup (hoặc domain của bạn)\n');

  const clientId = await ask('Nhập Google OAuth Client ID: ');
  if (!clientId || !clientId.trim()) {
    console.error('❌ Client ID không được để trống');
    process.exit(1);
  }

  const clientSecret = await ask('Nhập Google OAuth Client Secret: ');
  if (!clientSecret || !clientSecret.trim()) {
    console.error('❌ Client Secret không được để trống');
    process.exit(1);
  }

  const redirectUri = (await ask('Nhập Redirect URI [mặc định: http://localhost:5173/backup]: ')) || 'http://localhost:5173/backup';

  const folderId = await ask('Nhập Folder ID Google Drive (Enter để tự động tạo Invoice_Pro_Backups): ');

  const envContent = `
# ─────────────────────────────────────────────────────────────────────────────
# Google Drive Backup Configuration (OAuth 2.0)
# ─────────────────────────────────────────────────────────────────────────────
GOOGLE_OAUTH_CLIENT_ID=${clientId.trim()}
GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret.trim()}
GOOGLE_OAUTH_REDIRECT_URI=${redirectUri.trim()}
GOOGLE_DRIVE_FOLDER_ID=${folderId ? folderId.trim() : ''}

# Cài đặt lịch sao lưu
BACKUP_AUTO_ENABLED=true
BACKUP_CRON_SCHEDULE="0 2 * * *"
BACKUP_RETENTION_COUNT=7
BACKUP_MODE=INCREMENTAL
`;

  console.log('\n📝 Cấu hình đã chuẩn bị:\n');
  console.log('─'.repeat(70));
  console.log(envContent.trim());
  console.log('─'.repeat(70));

  const confirm = await ask('\nBạn có muốn tự động ghi vào backend/.env? (y/n): ');

  if (confirm.toLowerCase() === 'y') {
    const envPath = path.join(__dirname, '..', '.env');

    try {
      if (fs.existsSync(envPath)) {
        const backup = `${envPath}.backup.${Date.now()}`;
        fs.copyFileSync(envPath, backup);
        console.log(`\n💾 Đã backup .env hiện tại sang: ${path.basename(backup)}`);
      }

      fs.appendFileSync(envPath, envContent);
      console.log('✅ Đã cập nhật file backend/.env thành công!');

      console.log('\n🎉 Hoàn tất! Các bước tiếp theo:');
      console.log('1. Khởi động ứng dụng (nếu chưa chạy): npm run dev:backend');
      console.log('2. Mở trình duyệt tại trang: http://localhost:5173/backup');
      console.log('3. Nhấn "Kết nối Google Drive" để cấp quyền tài khoản.\n');
    } catch (err) {
      console.error(`❌ Lỗi khi ghi file: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log('\n📋 Bạn có thể copy nội dung phía trên và paste vào backend/.env thủ công.');
  }

  rl.close();
}

main().catch((err) => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
