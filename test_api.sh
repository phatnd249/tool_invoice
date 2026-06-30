#!/bin/bash

# Configuration
API_URL="http://localhost:3000"
TOKEN="eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIwMzEzMTcwODgxIiwidHlwZSI6MiwiZXhwIjoxNzgyMTQ0Mjc5LCJpYXQiOjE3ODIwNTc4Nzl9.8AnR6LKHHi_VV6lJp2pMmi5Cp86v-YRS__TqQYlLFm5F04ZuBu6I-J7zTz6yw58-zZoL0pwfClfSYOtRYDNWVw" # Thay thế bằng GDT token thực tế của bạn
START_DATE="01/05/2026"
END_DATE="15/05/2026"

echo "========================================="
echo "   SCRIPT KIỂM THỬ API HÓA ĐƠN ĐIỆN TỬ   "
echo "========================================="

# 1. Health Check
echo -e "\n[1/4] Kiểm tra sức khỏe hệ thống (Health Check)..."
curl -s -X GET "$API_URL/health" | JSON_PP=json_pp; if [ $? -eq 0 ]; then echo ""; else echo "curl failed"; fi

# 2. Tải hóa đơn từ Tổng cục Thuế
echo -e "\n[2/4] Gửi yêu cầu tải hóa đơn (Download Invoices)..."
DOWNLOAD_RESPONSE=$(curl -s -X POST "$API_URL/api/invoices/download" \
  -H "Content-Type: application/json" \
  -d "{
    \"startDate\": \"$START_DATE\",
    \"endDate\": \"$END_DATE\",
    \"token\": \"$TOKEN\",
    \"invoiceType\": \"SELL\",
    \"saveToDb\": true
  }")

echo "$DOWNLOAD_RESPONSE" | json_pp 2>/dev/null || echo "$DOWNLOAD_RESPONSE"

# 3. Lấy danh sách hóa đơn từ Database
echo -e "\n[3/4] Lấy danh sách hóa đơn từ Database (List Invoices)..."
INVOICES_LIST=$(curl -s -X GET "$API_URL/api/invoices?type=SELL")

echo "$INVOICES_LIST" | json_pp 2>/dev/null || echo "$INVOICES_LIST"

# 4. Xuất báo cáo Excel các hóa đơn vừa tải
echo -e "\n[4/4] Trích xuất ID hóa đơn và xuất báo cáo Excel (Export Excel)..."
# Trích xuất danh sách ID hóa đơn bằng python (vì gọn và hầu như máy nào cũng có sẵn)
INVOICE_IDS=$(echo "$INVOICES_LIST" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ids = [item['id'] for item in data]
    print(json.dumps(ids))
except Exception:
    print('[]')
")

if [ "$INVOICE_IDS" = "[]" ] || [ -z "$INVOICE_IDS" ]; then
  echo "Không tìm thấy hóa đơn nào trong DB để xuất báo cáo."
else
  echo "Danh sách IDs xuất bản: $INVOICE_IDS"
  curl -s -X POST "$API_URL/api/invoices/export" \
    -H "Content-Type: application/json" \
    -d "{\"invoiceIds\": $INVOICE_IDS}" \
    --output "BaoCao_HoaDon.xlsx"
    
  if [ -f "BaoCao_HoaDon.xlsx" ]; then
    echo "✔ Xuất báo cáo Excel thành công: ./BaoCao_HoaDon.xlsx"
  else
    echo "❌ Xuất báo cáo Excel thất bại."
  fi
fi

echo -e "\n========================================="
echo "             HOÀN THÀNH TEST             "
echo "========================================="
