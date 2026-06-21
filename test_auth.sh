#!/bin/bash

# Configuration
API_URL="http://localhost:3000"

echo "========================================="
echo "   KIỂM THỬ TỰ ĐỘNG ĐĂNG NHẬP (AUTH CAPTCHA) "
echo "========================================="

# Nhập MST và Mật khẩu từ người dùng (nếu không được truyền sẵn)
if [ -z "$MST" ]; then
  read -p "Nhập Mã số thuế (MST/Username): " MST
fi

if [ -z "$PASSWORD" ]; then
  read -sp "Nhập Mật khẩu tra cứu: " PASSWORD
  echo ""
fi

if [ -z "$MST" ] || [ -z "$PASSWORD" ]; then
  echo "❌ Lỗi: Mã số thuế và Mật khẩu không được để trống."
  exit 1
fi

echo -e "\n[*] Đang gửi yêu cầu đăng nhập và tự động giải Captcha bằng Gemini..."
echo "[*] URL: $API_URL/api/auth/token"

# Thực hiện POST request
RESPONSE=$(curl -s -X POST "$API_URL/api/auth/token" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$MST\", \"password\": \"$PASSWORD\"}")

# Định dạng in kết quả JSON
echo -e "\nKết quả phản hồi từ API:"
echo "$RESPONSE" | json_pp 2>/dev/null || echo "$RESPONSE"

echo "========================================="
