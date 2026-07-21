const fs = require('fs');
const path = require('path');

const companies = [
  "CÔNG TY TNHH MỘT THÀNH VIÊN THƯƠNG MẠI DỊCH VỤ MÔ TÔ XE MÁY AN THÀNH PHÁT",
  "CÔNG TY TNHH MỘT THÀNH VIÊN VÀNG BẠC ĐÁ QUÝ CẦM ĐỒ VIỄN"
];

const invoicesDir = path.join(__dirname, 'invoices');

function getStats(dir) {
  if (!fs.existsSync(dir)) {
    return { error: 'Thư mục không tồn tại' };
  }

  let totalFiles = 0;
  let zips = 0;
  let pdfs = 0;
  let xmls = 0;
  let others = 0;
  const invoiceNumbers = new Set();

  function scan(currentDir) {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scan(fullPath);
      } else {
        totalFiles++;
        const ext = path.extname(item).toLowerCase();
        if (ext === '.zip') zips++;
        else if (ext === '.pdf') pdfs++;
        else if (ext === '.xml') xmls++;
        else others++;

        // Extract invoice number. Old format: {nbmst}-{shdon}-{resultCode}.ext
        // New format: {nbmst}-{khmshdon}-{khhdon}-{shdon}-{resultCode}.ext
        const nameWithoutExt = path.basename(item, ext);
        const parts = nameWithoutExt.split('-');
        let shdon = '';
        if (parts.length === 3) {
           shdon = parts[1];
        } else if (parts.length === 5) {
           shdon = parts[3];
        } else if (parts.length > 0) {
           shdon = parts[parts.length - 2] || parts[1]; 
        }

        if (shdon && !isNaN(parseInt(shdon, 10))) {
          invoiceNumbers.add(shdon);
        }
      }
    }
  }

  scan(dir);

  return {
    totalFiles,
    zips,
    pdfs,
    xmls,
    others,
    uniqueInvoiceNumbers: invoiceNumbers.size
  };
}

for (const company of companies) {
  console.log(`\n=== Báo cáo thống kê: ${company} ===`);
  const dir = path.join(invoicesDir, company);
  const stats = getStats(dir);
  if (stats.error) {
    console.log(stats.error);
  } else {
    console.log(`- Tổng số file hiện có: ${stats.totalFiles}`);
    console.log(`  + Số lượng file .ZIP: ${stats.zips}`);
    console.log(`  + Số lượng file .XML: ${stats.xmls}`);
    console.log(`  + Số lượng file .PDF: ${stats.pdfs}`);
    if (stats.others > 0) {
      console.log(`  + File khác (.xlsx, ...): ${stats.others}`);
    }
    console.log(`- Số lượng "Số hóa đơn" (shdon) duy nhất phát hiện được từ tên file: ${stats.uniqueInvoiceNumbers}`);
  }
}
