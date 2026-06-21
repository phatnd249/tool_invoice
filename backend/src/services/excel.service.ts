import ExcelJS from 'exceljs';
import { ParsedInvoice } from './parser.service.js';

export class ExcelService {
  /**
   * Cleans Excel sheet names to be within limits and exclude illegal characters
   */
  private cleanSheetName(lookupCode: string | undefined, invoiceNumber: string): string {
    const base = lookupCode || `HD_${invoiceNumber}`;
    const clean = base.replace(/[\\/*?:[\]]/g, '');
    return clean.slice(0, 31);
  }

  /**
   * Formats invoice number to 8 digits string (e.g. 00000021)
   */
  private formatInvoiceNumber(shdon: string): string {
    const num = parseInt(shdon, 10);
    return isNaN(num) ? shdon : String(num).padStart(8, '0');
  }

  /**
   * Generates a styled Excel workbook from parsed invoices list and returns its buffer
   */
  public async generateInvoiceReport(invoices: ParsedInvoice[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    
    // ---------------------------------------------------------
    // STYLE DEFINITIONS (Navy theme)
    // ---------------------------------------------------------
    const primaryColor = 'FF1F4E78'; // Navy Blue
    const headerFont = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    const titleFont = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF1F4E78' } };
    const dataFont = { name: 'Segoe UI', size: 10 };
    const totalFont = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
    const italicFont = { name: 'Segoe UI', size: 9, italic: true };
    const linkFont = { 
      name: 'Segoe UI', 
      size: 10, 
      color: { argb: 'FF0563C1' }, 
      underline: 'single' as const 
    };

    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: primaryColor }
    };
    const zebraFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF9FBFD' }
    };
    const totalFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEAF2F8' }
    };

    const thinBorder: any = {
      top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
    };
    const totalBorder: any = {
      top: { style: 'thin', color: { argb: 'FF1F4E78' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'double', color: { argb: 'FF1F4E78' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
    };

    // ---------------------------------------------------------
    // PRE-CALCULATE UNIQUE SHEET NAMES TO PREVENT DUPLICATES
    // ---------------------------------------------------------
    const sheetNamesMap = new Map<string, string>(); // key: invoice_key -> uniqueName
    const usedNames = new Set<string>();

    invoices.forEach(inv => {
      const baseName = this.cleanSheetName(inv.lookupCode, inv.invoiceNumber);
      let uniqueName = baseName;
      let counter = 1;
      while (usedNames.has(uniqueName.toLowerCase())) {
        const suffix = `_${counter}`;
        uniqueName = baseName.slice(0, 31 - suffix.length) + suffix;
        counter++;
      }
      usedNames.add(uniqueName.toLowerCase());
      const invoiceKey = `${inv.invoiceNumber}_${inv.sellerTaxCode}_${inv.buyerTaxCode}`;
      sheetNamesMap.set(invoiceKey, uniqueName);
    });

    // ---------------------------------------------------------
    // SHEET 1: SUMMARY
    // ---------------------------------------------------------
    const summarySheet = workbook.addWorksheet('TongQuan_HoaDon', {
      views: [{ showGridLines: true }]
    });

    // Title Block
    summarySheet.mergeCells('A1:N1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = 'BẢNG TỔNG HỢP HÓA ĐƠN ĐIỆN TỬ';
    titleCell.font = titleFont;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    summarySheet.getRow(1).height = 40;

    summarySheet.getCell('A2').value = `Ngày xuất báo cáo: ${new Date().toLocaleString('vi-VN')}`;
    summarySheet.getCell('A2').font = italicFont;
    summarySheet.getRow(2).height = 20;

    // Headers
    const headers = [
      'STT', 'Số Hóa Đơn', 'Ngày Lập', 'Mã Tra Cứu', 'Mã CQ Thuế (MCCQT)',
      'MST Người Mua', 'Tên Người Mua', 'Tiền Trước Thuế', 'Tiền Thuế',
      'Tổng Cộng Thanh Toán', 'Hình Thức TT', 'Tiền Bằng Chữ',
      'Chi Tiết Hàng Hóa', 'Tên Tệp XML'
    ];

    summarySheet.getRow(3).height = 28;
    headers.forEach((h, idx) => {
      const cell = summarySheet.getCell(3, idx + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    });

    // Fill data rows
    let startRow = 4;
    invoices.forEach((inv, index) => {
      const row = summarySheet.getRow(startRow);
      row.height = 22;

      const formattedNo = this.formatInvoiceNumber(inv.invoiceNumber);
      const invoiceDateStr = inv.invoiceDate.toLocaleDateString('vi-VN');

      row.getCell(1).value = index + 1; // STT
      row.getCell(2).value = formattedNo; // Số HĐ
      row.getCell(3).value = invoiceDateStr; // Ngày lập
      row.getCell(4).value = inv.lookupCode || ''; // Mã tra cứu
      row.getCell(5).value = inv.taxAuthorityCode || ''; // Mã CQ Thuế
      row.getCell(6).value = inv.buyerTaxCode; // MST mua
      row.getCell(7).value = inv.buyerName; // Tên mua
      row.getCell(8).value = inv.totalBeforeTax; // Trước thuế
      row.getCell(9).value = inv.taxAmount; // Tiền thuế
      row.getCell(10).value = inv.totalAmount; // Tổng cộng
      row.getCell(11).value = inv.paymentMethod || ''; // HTTT
      row.getCell(12).value = inv.totalAmountInWords || ''; // Bằng chữ
      
      // Hyperlink to detail sheet using pre-calculated unique name
      const invoiceKey = `${inv.invoiceNumber}_${inv.sellerTaxCode}_${inv.buyerTaxCode}`;
      const subSheetName = sheetNamesMap.get(invoiceKey) || `HD_${inv.invoiceNumber}`;
      row.getCell(13).value = {
        text: 'Xem chi tiết',
        hyperlink: `#${subSheetName}!A1`
      };
      row.getCell(13).font = linkFont;

      row.getCell(14).value = inv.xmlFile; // File XML

      // Formatting
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(7).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      
      row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(8).numFmt = '#,##0';
      
      row.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(9).numFmt = '#,##0';
      
      row.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(10).numFmt = '#,##0';
      
      row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(12).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      row.getCell(13).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(14).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

      // Apply borders, zebra striping and data fonts
      const isEven = startRow % 2 === 0;
      for (let col = 1; col <= 14; col++) {
        const cell = row.getCell(col);
        if (col !== 13) {
          cell.font = dataFont;
        }
        cell.border = thinBorder;
        if (isEven) {
          cell.fill = zebraFill;
        }
      }

      startRow++;
    });

    // Total Row
    const totalRow = summarySheet.getRow(startRow);
    totalRow.height = 24;
    summarySheet.mergeCells(`A${startRow}:G${startRow}`);
    
    const totalLabelCell = totalRow.getCell(1);
    totalLabelCell.value = 'TỔNG CỘNG';
    totalLabelCell.font = totalFont;
    totalLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

    // Sum formulas
    const lastDataRow = startRow - 1;
    totalRow.getCell(8).value = { formula: `=SUM(H4:H${lastDataRow})`, result: 0 };
    totalRow.getCell(9).value = { formula: `=SUM(I4:I${lastDataRow})`, result: 0 };
    totalRow.getCell(10).value = { formula: `=SUM(J4:J${lastDataRow})`, result: 0 };

    for (let col = 8; col <= 10; col++) {
      const cell = totalRow.getCell(col);
      cell.font = totalFont;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.numFmt = '#,##0';
    }

    for (let col = 1; col <= 14; col++) {
      const cell = totalRow.getCell(col);
      cell.border = totalBorder;
      cell.fill = totalFill;
    }

    // ---------------------------------------------------------
    // SHEET N: DETAILS FOR EACH INVOICE
    // ---------------------------------------------------------
    invoices.forEach(inv => {
      const invoiceKey = `${inv.invoiceNumber}_${inv.sellerTaxCode}_${inv.buyerTaxCode}`;
      const subSheetName = sheetNamesMap.get(invoiceKey) || `HD_${inv.invoiceNumber}`;
      const subSheet = workbook.addWorksheet(subSheetName, {
        views: [{ showGridLines: true }]
      });

      // Child Title
      subSheet.mergeCells('A1:G1');
      const subTitle = subSheet.getCell('A1');
      subTitle.value = `CHI TIẾT HÀNG HÓA DỊCH VỤ HÓA ĐƠN SỐ ${this.formatInvoiceNumber(inv.invoiceNumber)}`;
      subTitle.font = titleFont;
      subTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      subSheet.getRow(1).height = 35;

      // Back Link
      subSheet.getCell('A2').value = {
        text: '← Về trang tổng quan',
        hyperlink: `#TongQuan_HoaDon!A1`
      };
      subSheet.getCell('A2').font = linkFont;
      subSheet.getRow(2).height = 20;

      // Metadata Info
      subSheet.getCell('A3').value = `Người bán: ${inv.sellerName} (MST: ${inv.sellerTaxCode})`;
      subSheet.getCell('A3').font = dataFont;
      subSheet.getCell('A4').value = `Người mua: ${inv.buyerName} (MST: ${inv.buyerTaxCode})`;
      subSheet.getCell('A4').font = dataFont;
      
      subSheet.getRow(3).height = 18;
      subSheet.getRow(4).height = 18;
      subSheet.getRow(5).height = 10; // spacer row

      // Sub Table Header
      const subHeaders = [
        'STT', 'Tên Hàng Hóa, Dịch Vụ', 'Đơn Vị Tính', 'Số Lượng', 
        'Đơn Giá', 'Thành Tiền (Chưa Thuế)', 'Thuế Suất'
      ];
      subSheet.getRow(6).height = 26;
      subHeaders.forEach((sh, idx) => {
        const cell = subSheet.getCell(6, idx + 1);
        cell.value = sh;
        cell.font = headerFont;
        cell.fill = headerFill;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = thinBorder;
      });

      // Write items
      let subStartRow = 7;
      inv.items.forEach(item => {
        const row = subSheet.getRow(subStartRow);
        row.height = 22;

        row.getCell(1).value = item.lineNumber ? parseInt(item.lineNumber) || item.lineNumber : '';
        row.getCell(2).value = item.name;
        row.getCell(3).value = item.unit || '';
        row.getCell(4).value = item.quantity;
        row.getCell(5).value = item.price;
        row.getCell(6).value = item.amount;
        row.getCell(7).value = item.taxRate || '';

        // Alignments & Number formats
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        
        row.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(4).numFmt = '#,##0.00';
        
        row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(5).numFmt = '#,##0';
        
        row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(6).numFmt = '#,##0';
        
        row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

        const isSubEven = subStartRow % 2 === 0;
        for (let col = 1; col <= 7; col++) {
          const cell = row.getCell(col);
          cell.font = dataFont;
          cell.border = thinBorder;
          if (isSubEven) {
            cell.fill = zebraFill;
          }
        }

        subStartRow++;
      });

      // Total for details sheet
      const subTotalRow = subSheet.getRow(subStartRow);
      subTotalRow.height = 24;
      subSheet.mergeCells(`A${subStartRow}:E${subStartRow}`);
      
      const subTotalLabel = subTotalRow.getCell(1);
      subTotalLabel.value = 'TỔNG CỘNG CHI TIẾT THÀNH TIỀN';
      subTotalLabel.font = totalFont;
      subTotalLabel.alignment = { horizontal: 'right', vertical: 'middle' };

      const subLastDataRow = subStartRow - 1;
      const amountSumCell = subTotalRow.getCell(6);
      amountSumCell.value = { formula: `=SUM(F7:F${subLastDataRow})`, result: 0 };
      amountSumCell.font = totalFont;
      amountSumCell.alignment = { horizontal: 'right', vertical: 'middle' };
      amountSumCell.numFmt = '#,##0';

      for (let col = 1; col <= 7; col++) {
        const cell = subTotalRow.getCell(col);
        cell.border = totalBorder;
        cell.fill = totalFill;
      }
    });

    // ---------------------------------------------------------
    // AUTO-FIT COLUMNS WIDTHS
    // ---------------------------------------------------------
    workbook.worksheets.forEach(ws => {
      ws.columns.forEach(col => {
        let maxLen = 0;
        col.eachCell!({ includeEmpty: false }, cell => {
          let cellVal = cell.value;
          if (cellVal && typeof cellVal === 'object') {
            if ('text' in cellVal) cellVal = (cellVal as any).text;
            else if ('formula' in cellVal) cellVal = '0000000000';
          }
          const str = cellVal ? String(cellVal) : '';
          if (str.length > maxLen) maxLen = str.length;
        });
        col.width = Math.max(maxLen + 4, 12);
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
