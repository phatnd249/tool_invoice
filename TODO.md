# Tải file Excel tổng hợp hoá đơn từ GDT

## Mục tiêu

Ngoài việc tải từng file ZIP/XML cho mỗi hoá đơn, cần tải thêm **file Excel tổng hợp** (export-excel) từ GDT portal cho khoảng thời gian đã query. File này được tải sau khi query thành công và lưu vào cùng thư mục output.

## Thông tin API (từ trình duyệt)

```
GET https://hoadondientu.gdt.gov.vn/api/query/invoices/export-excel
  ?sort=tdlap:desc
  &search=tdlap=ge=01/05/2026T00:00:00;tdlap=le=31/05/2026T23:59:59

Headers:
  Authorization: Bearer <token>
  Accept: application/json, text/plain, */*
  Accept-Language: vi
```

- Endpoint path khác nhau theo loại hoá đơn:
  - Bán ra (SELL): `/api/query/invoices/sold/export-excel`
  - Mua vào (BUY): `/api/query/invoices/purchase/export-excel`

## Luồng thực hiện

```
queryInvoicesInRange() → trả về dữ liệu JSON
  ↓
downloadExcelReport()  → tải file Excel cho toàn bộ khoảng thời gian
  ↓
downloadInvoiceZip()   → tải từng file ZIP/XML (như hiện tại)
```

## Các bước triển khai

### Bước 1: Thêm method `downloadExcelReport()` trong `downloader.service.ts`

```ts
/**
 * Download Excel report for a date range from GDT.
 * Returns path to saved .xlsx file, or null on failure.
 */
public async downloadExcelReport(
  startDate: Date,
  endDate: Date,
  token: string,
  type: 'BUY' | 'SELL',
  outputDir: string
): Promise<string | null> {
  const formatGdtDate = (d: Date, endOfDay: boolean) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const time = endOfDay ? 'T23:59:59' : 'T00:00:00';
    return `${dd}/${mm}/${yyyy}${time}`;
  };

  const startStr = formatGdtDate(startDate, false);
  const endStr = formatGdtDate(endDate, true);

  const apiPath = type === 'BUY' ? 'purchase' : 'sold';
  const url = `https://hoadondientu.gdt.gov.vn/api/query/invoices/${apiPath}/export-excel?sort=tdlap:desc&search=tdlap=ge=${startStr};tdlap=le=${endStr}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'vi',
  };

  const fileName = `invoices_${type}_${startStr.replace(/[/:]/g, '-')}_to_${endStr.replace(/[/:]/g, '-')}.xlsx`;
  const filePath = path.join(outputDir, fileName);

  // Skip if already downloaded
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    console.log(`[DownloaderService] Excel report already exists: ${filePath}`);
    return filePath;
  }

  try {
    const response = await axios.get(url, {
      headers,
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    if (response.status === 200) {
      fs.writeFileSync(filePath, response.data);
      console.log(`[DownloaderService] Downloaded Excel report: ${filePath}`);
      return filePath;
    }
    return null;
  } catch (error: any) {
    console.error(`[DownloaderService] Failed to download Excel report: ${error.message}`);
    return null;
  }
}
```

### Bước 2: Cập nhật `invoice.controller.ts` — gọi `downloadExcelReport()` sau khi query

Trong hàm `downloadInvoices()`, sau `queryInvoicesInRange` thành công và trước vòng lặp download ZIP, thêm:

```ts
// Tải file Excel tổng hợp cho toàn bộ khoảng thời gian
for (const chunk of dateChunks) {
  try {
    const excelPath = await downloaderService.downloadExcelReport(
      chunk.start, chunk.end, activeToken, type, targetDir
    );
    if (excelPath) {
      console.log(`[InvoiceController] Excel report saved: ${excelPath}`);
    }
  } catch (err: any) {
    console.warn(`[InvoiceController] Failed to download Excel report: ${err.message}`);
  }
}
```

Lưu ý: gọi cho từng chunk date vì GDT có thể giới hạn số lượng kết quả trong 1 lần export Excel.

---

## Tóm tắt thay đổi

| File | Hành động |
|---|---|
| `backend/src/services/downloader.service.ts` | **Thêm** method `downloadExcelReport()` |
| `backend/src/controllers/invoice.controller.ts` | **Gọi** `downloadExcelReport()` sau khi query, trước khi download ZIP |
