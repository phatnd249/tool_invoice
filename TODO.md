# Kế hoạch triển khai: Xem chi tiết sản phẩm của hoá đơn

## 1. Vấn đề

Mỗi hoá đơn có danh sách các sản phẩm/dịch vụ kèm số lượng, đơn giá, thuế suất. Hiện tại giao diện chỉ hiển thị tổng thanh toán, không xem được chi tiết từng sản phẩm.

## 2. Dữ liệu

Backend đã trả về `items` trong response `GET /api/invoices`:
```json
{
  "items": [
    {
      "id": 1496,
      "invoiceId": "c6b7a99a-...",
      "lineNumber": "1",
      "name": "Mực in TPU-102",
      "unit": "Kg",
      "quantity": 100,
      "price": 103500,
      "amount": 10350000,
      "taxRate": "8%"
    }
  ]
}
```

## 3. Giải pháp

Thêm nút "Chi tiết" (icon `List` hoặc `Info`) trên mỗi dòng invoice. Khi click, mở modal hiển thị bảng danh sách sản phẩm.

## 4. Các bước triển khai

### 4.1. Frontend — `InvoiceHistory.tsx`

- [ ] **Thêm interface `InvoiceItem`**:
  ```typescript
  interface InvoiceItem {
    id: number;
    invoiceId: string;
    lineNumber?: string;
    name: string;
    unit?: string;
    quantity?: number;
    price?: number;
    amount: number;
    taxRate?: string;
  }
  ```

- [ ] **Thêm `items?: InvoiceItem[]` vào interface `Invoice`**

- [ ] **Thêm state cho modal chi tiết**:
  ```typescript
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  ```

- [ ] **Thêm cột mới "Chi tiết"** trong bảng invoices, giữa cột "Tổng Thanh Toán" và "Tải Tệp":
  - Nút icon `List` hoặc `ClipboardList`
  - Title: "Xem chi tiết sản phẩm"

- [ ] **Thêm modal** hiển thị:
  - Header: Số hoá đơn + ngày lập + tên bên bán/bên mua
  - Bảng items:
    | STT | Tên hàng hoá | ĐVT | Số lượng | Đơn giá | Thành tiền | Thuế suất |
  - Định dạng số: `toLocaleString('vi-VN')` cho tiền tệ
  - Nút đóng modal

### 4.2. Backend — Không cần sửa

Backend đã trả về `items` trong `GET /api/invoices`. Data đã đầy đủ.

## 5. Ưu tiên

Chỉ cần sửa 1 file frontend: `InvoiceHistory.tsx`
