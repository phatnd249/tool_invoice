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
    totalRow.getCell(8).value = { formula: `SUM(H4:H${lastDataRow})`, result: 0 };
    totalRow.getCell(9).value = { formula: `SUM(I4:I${lastDataRow})`, result: 0 };
    totalRow.getCell(10).value = { formula: `SUM(J4:J${lastDataRow})`, result: 0 };

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
      amountSumCell.value = { formula: `SUM(F7:F${subLastDataRow})`, result: 0 };
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

  /**
   * Generates a styled Excel report for Module 7 with BÁN RA and MUA VÀO sheets
   */
  public async generateModule7Report(invoices: (ParsedInvoice & { type: string })[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    
    // Style configurations
    const fontName = 'Times New Roman';
    const titleFont = { name: fontName, size: 13, bold: true };
    const subtitleFont = { name: fontName, size: 13, italic: true };
    const headerFont = { name: fontName, size: 13, bold: true };
    const sectionFont = { name: fontName, size: 13, bold: true };
    const dataFont = { name: fontName, size: 13 };
    const dataBoldFont = { name: fontName, size: 13, bold: true };
    const italicFont = { name: fontName, size: 13, italic: true };
    
    const headerAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const leftAlign: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle', wrapText: true };
    const rightAlign: Partial<ExcelJS.Alignment> = { horizontal: 'right', vertical: 'middle' };
    const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };

    const thinBorder: any = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };

    // Helper to style range of cells (important for merged cells)
    const styleRange = (
      ws: ExcelJS.Worksheet,
      startRow: number,
      startCol: number,
      endRow: number,
      endCol: number,
      style: { font?: any; alignment?: any; border?: any; numFmt?: string }
    ) => {
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const cell = ws.getCell(r, c);
          if (style.font) cell.font = style.font;
          if (style.alignment) cell.alignment = style.alignment;
          if (style.border) cell.border = style.border;
          if (style.numFmt) cell.numFmt = style.numFmt;
        }
      }
    };

    // Determine taxpayer information and report period
    let taxpayerName = 'CÔNG TY TNHH THƯƠNG MẠI DỊCH VỤ THIÊN BẢO TIẾN';
    let taxpayerTaxCode = '0313170881';

    const sellInvoices = invoices.filter(inv => inv.type === 'SELL');
    const buyInvoices = invoices.filter(inv => inv.type === 'BUY');

    if (sellInvoices.length > 0) {
      taxpayerName = sellInvoices[0].sellerName;
      taxpayerTaxCode = sellInvoices[0].sellerTaxCode;
    } else if (buyInvoices.length > 0) {
      taxpayerName = buyInvoices[0].buyerName;
      taxpayerTaxCode = buyInvoices[0].buyerTaxCode;
    }

    let periodStr = 'Kỳ tính thuế: Quý 1 năm 2026';
    if (invoices.length > 0) {
      const dates = invoices.map(inv => new Date(inv.invoiceDate));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      const minYear = minDate.getFullYear();
      const maxYear = maxDate.getFullYear();
      
      if (minYear === maxYear) {
        const minMonth = minDate.getMonth();
        const maxMonth = maxDate.getMonth();
        if (minMonth === maxMonth) {
          periodStr = `Kỳ tính thuế: Tháng ${minMonth + 1} năm ${minYear}`;
        } else {
          const minQuarter = Math.floor(minMonth / 3) + 1;
          const maxQuarter = Math.floor(maxMonth / 3) + 1;
          if (minQuarter === maxQuarter) {
            periodStr = `Kỳ tính thuế: Quý ${minQuarter} năm ${minYear}`;
          } else {
            const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            periodStr = `Kỳ tính thuế: Từ ngày ${fmt(minDate)} đến ngày ${fmt(maxDate)}`;
          }
        }
      } else {
        const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        periodStr = `Kỳ tính thuế: Từ ngày ${fmt(minDate)} đến ngày ${fmt(maxDate)}`;
      }
    }

    // Helper to map invoice items taxRate into standard category group numbers
    const getTaxGroup = (taxRateStr: string | null | undefined): number => {
      if (!taxRateStr) return 1; // Default to Non-taxable
      const r = taxRateStr.toUpperCase().replace(/\s%/g, '').trim();
      if (r.includes('KKKNT') || r.includes('KHN') || r.includes('KKNT') || r.includes('KTPTH')) {
        return 5;
      }
      if (r.includes('KCT') || r.includes('KHONGCHIUTHUE')) {
        return 1;
      }
      if (r.includes('0') || r === '0%') {
        return 2;
      }
      if (r.includes('5') || r === '5%') {
        return 50; // Group 5%
      }
      if (r.includes('8') || r === '8%') {
        return 8;
      }
      if (r.includes('10') || r === '10%') {
        return 10;
      }
      return 1;
    };

    // =========================================================
    // SHEET 1: BÁN RA
    // =========================================================
    const wsSell = workbook.addWorksheet('BÁN RA', { views: [{ showGridLines: true }] });
    
    // Standard Column Widths (matching template exactly)
    const sellColWidths = [8.38, 8.13, 9.13, 10.38, 11.13, 13.38, 38.88, 21.38, 35.75, 21.38, 24.13, 13.88, 22.38, 28.63];
    sellColWidths.forEach((w, i) => {
      wsSell.getColumn(i + 1).width = w;
    });

    wsSell.getRow(1).height = 15;
    
    wsSell.mergeCells('B2:L2');
    wsSell.getCell('B2').value = 'BẢNG KÊ HOÁ ĐƠN, CHỨNG TỪ HÀNG HOÁ, DỊCH VỤ BÁN RA';
    styleRange(wsSell, 2, 2, 2, 12, { font: titleFont, alignment: headerAlign });
    wsSell.getRow(2).height = 25;

    wsSell.mergeCells('B3:L3');
    wsSell.getCell('B3').value = '(Kèm theo tờ khai thuế GTGT theo mẫu số 01/GTGT)';
    styleRange(wsSell, 3, 2, 3, 12, { font: subtitleFont, alignment: headerAlign });
    wsSell.getRow(3).height = 20;

    wsSell.mergeCells('B4:L4');
    wsSell.getCell('B4').value = periodStr;
    styleRange(wsSell, 4, 2, 4, 12, { font: dataFont, alignment: headerAlign });
    wsSell.getRow(4).height = 20;

    wsSell.mergeCells('B5:L5');
    wsSell.getCell('B5').value = 'Người nộp thuế:  ' + taxpayerName;
    styleRange(wsSell, 5, 2, 5, 12, { font: titleFont, alignment: leftAlign });
    wsSell.getRow(5).height = 20;

    wsSell.mergeCells('B6:L6');
    wsSell.getCell('B6').value = 'Mã số thuế: ' + taxpayerTaxCode;
    styleRange(wsSell, 6, 2, 6, 12, { font: titleFont, alignment: leftAlign });
    wsSell.getRow(6).height = 20;

    wsSell.mergeCells('B7:L7');
    wsSell.getCell('B7').value = 'Đơn vị tiền: đồng Việt Nam';
    styleRange(wsSell, 7, 2, 7, 12, { font: italicFont, alignment: leftAlign });
    wsSell.getRow(7).height = 20;

    // Headers Layout
    wsSell.mergeCells('B8:B10');
    wsSell.getCell('B8').value = 'STT';
    styleRange(wsSell, 8, 2, 10, 2, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsSell.mergeCells('C8:F9');
    styleRange(wsSell, 8, 3, 9, 6, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsSell.getCell('C10').value = 'Ký hiệu mẫu hóa đơn';
    styleRange(wsSell, 10, 3, 10, 3, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsSell.getCell('D10').value = 'Ký hiệu hoá đơn';
    styleRange(wsSell, 10, 4, 10, 4, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsSell.getCell('E10').value = 'Số hoá đơn';
    styleRange(wsSell, 10, 5, 10, 5, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsSell.getCell('F10').value = 'Ngày, tháng, năm lập hóa đơn';
    styleRange(wsSell, 10, 6, 10, 6, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsSell.mergeCells('G8:G10');
    wsSell.getCell('G8').value = 'Tên người mua';
    styleRange(wsSell, 8, 7, 10, 7, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsSell.mergeCells('H8:H10');
    wsSell.getCell('H8').value = 'Mã số thuế người mua';
    styleRange(wsSell, 8, 8, 10, 8, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsSell.mergeCells('I8:I10');
    wsSell.getCell('I8').value = 'Mặt hàng';
    styleRange(wsSell, 8, 9, 10, 9, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsSell.mergeCells('J8:J10');
    wsSell.getCell('J8').value = 'Doanh thu chưa có thuế GTGT';
    styleRange(wsSell, 8, 10, 10, 10, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsSell.mergeCells('K8:K10');
    wsSell.getCell('K8').value = 'Thuế GTGT';
    styleRange(wsSell, 8, 11, 10, 11, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsSell.mergeCells('L8:L10');
    wsSell.getCell('L8').value = 'Ghi chú';
    styleRange(wsSell, 8, 12, 10, 12, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsSell.getRow(8).height = 15;
    wsSell.getRow(9).height = 15;
    wsSell.getRow(10).height = 25;

    // Row 11: indices
    const row11 = wsSell.getRow(11);
    row11.height = 20;
    const indicesSell = ['[1]', '[2]', '[3]', '[2]', '[3]', '[4]', '[5]', '[6]', '[7]', '[8]', '[9]'];
    indicesSell.forEach((val, idx) => {
      row11.getCell(idx + 2).value = val;
    });
    styleRange(wsSell, 11, 2, 11, 12, { font: dataFont, alignment: centerAlign, border: thinBorder });

    // Grouping selling invoices
    const groups: { [key: number]: any[] } = { 1: [], 2: [], 50: [], 8: [], 10: [], 5: [] };
    sellInvoices.forEach(inv => {
      const gr = getTaxGroup(inv.items[0]?.taxRate);
      if (groups[gr]) groups[gr].push(inv);
      else groups[1].push(inv);
    });

    const sellGroupConfigs = [
      { id: 1, label: '1. Hàng hóa, dịch vụ không chịu thuế giá trị gia tăng (GTGT):' },
      { id: 2, label: '2. Hàng hoá, dịch vụ chịu thuế suất thuế GTGT 0%:' },
      { id: 50, label: 'Hàng hoá, dịch vụ chịu thuế suất thuế GTGT 5%:', optional: true },
      { id: 8, label: '3. Hàng hoá, dịch vụ chịu thuế suất thuế GTGT 8%:' },
      { id: 10, label: '4. Hàng hoá, dịch vụ chịu thuế suất thuế GTGT 10%:' },
      { id: 5, label: '5. Hàng hóa, dịch vụ không phải tổng hợp trên tờ khai 01/GTGT:' }
    ];

    let sellRowIdx = 12;
    const sellTotalRows: number[] = [];

    sellGroupConfigs.forEach(g => {
      if (g.optional && groups[g.id].length === 0) return;

      // Section Title Row
      wsSell.mergeCells(`B${sellRowIdx}:L${sellRowIdx}`);
      wsSell.getCell(`B${sellRowIdx}`).value = g.label;
      styleRange(wsSell, sellRowIdx, 2, sellRowIdx, 12, { font: sectionFont, alignment: leftAlign, border: thinBorder });
      wsSell.getRow(sellRowIdx).height = 22;
      sellRowIdx++;

      const startData = sellRowIdx;
      const items = groups[g.id];

      items.forEach((inv, idx) => {
        const row = wsSell.getRow(sellRowIdx);
        row.height = 22;

        row.getCell(2).value = String(idx + 1).padStart(2, '0');
        row.getCell(3).value = inv.templateSymbol || '';
        row.getCell(4).value = inv.invoiceSymbol || '';
        
        const num = parseInt(inv.invoiceNumber, 10);
        row.getCell(5).value = isNaN(num) ? inv.invoiceNumber : num;

        row.getCell(6).value = new Date(inv.invoiceDate);
        row.getCell(6).numFmt = 'dd/mm/yyyy';

        row.getCell(7).value = inv.buyerName || '';
        row.getCell(8).value = inv.buyerTaxCode || '';
        row.getCell(9).value = inv.items.map((item: any) => item.name).join(', ');

        row.getCell(10).value = inv.totalBeforeTax;
        row.getCell(10).numFmt = '#,##0';

        row.getCell(11).value = inv.taxAmount;
        row.getCell(11).numFmt = '#,##0';

        row.getCell(12).value = { formula: `=IF(M${sellRowIdx}>=5000000,"CK","TM")` };
        row.getCell(13).value = { formula: `=J${sellRowIdx}+K${sellRowIdx}` };
        row.getCell(13).numFmt = '#,##0';

        styleRange(wsSell, sellRowIdx, 2, sellRowIdx, 13, { font: dataFont, border: thinBorder });
        
        row.getCell(2).alignment = centerAlign;
        row.getCell(3).alignment = centerAlign;
        row.getCell(4).alignment = centerAlign;
        row.getCell(5).alignment = centerAlign;
        row.getCell(6).alignment = centerAlign;
        row.getCell(7).alignment = leftAlign;
        row.getCell(8).alignment = centerAlign;
        row.getCell(9).alignment = leftAlign;
        row.getCell(10).alignment = rightAlign;
        row.getCell(11).alignment = rightAlign;
        row.getCell(12).alignment = centerAlign;
        row.getCell(13).alignment = rightAlign;

        sellRowIdx++;
      });

      const endData = sellRowIdx - 1;

      // Section Total Row
      const totalRow = wsSell.getRow(sellRowIdx);
      totalRow.height = 24;
      totalRow.getCell(2).value = 'Tổng';
      
      if (items.length > 0) {
        totalRow.getCell(10).value = { formula: `=SUM(J${startData}:J${endData})` };
        totalRow.getCell(11).value = { formula: `=SUM(K${startData}:K${endData})` };
        totalRow.getCell(13).value = { formula: `=SUM(M${startData}:M${endData})` };
      } else {
        totalRow.getCell(10).value = 0;
        totalRow.getCell(11).value = 0;
        totalRow.getCell(13).value = 0;
      }

      totalRow.getCell(10).numFmt = '#,##0';
      totalRow.getCell(11).numFmt = '#,##0';
      totalRow.getCell(13).numFmt = '#,##0';

      styleRange(wsSell, sellRowIdx, 2, sellRowIdx, 13, { font: dataBoldFont, border: thinBorder });
      totalRow.getCell(2).alignment = centerAlign;
      totalRow.getCell(10).alignment = rightAlign;
      totalRow.getCell(11).alignment = rightAlign;
      totalRow.getCell(13).alignment = rightAlign;

      // Only sum sections that go into the 01/GTGT report
      if (g.id !== 5) {
        sellTotalRows.push(sellRowIdx);
      }

      sellRowIdx++;
    });

    // Grand Total Row
    const grandRow = wsSell.getRow(sellRowIdx);
    grandRow.height = 24;
    grandRow.getCell(2).value = 'Tổng';
    if (sellTotalRows.length > 0) {
      grandRow.getCell(10).value = { formula: '=' + sellTotalRows.map(r => `J${r}`).join('+') };
      grandRow.getCell(11).value = { formula: '=' + sellTotalRows.map(r => `K${r}`).join('+') };
    } else {
      grandRow.getCell(10).value = 0;
      grandRow.getCell(11).value = 0;
    }
    grandRow.getCell(13).value = { formula: `=J${sellRowIdx}+K${sellRowIdx}` };

    grandRow.getCell(10).numFmt = '#,##0';
    grandRow.getCell(11).numFmt = '#,##0';
    grandRow.getCell(13).numFmt = '#,##0';

    styleRange(wsSell, sellRowIdx, 2, sellRowIdx, 13, { font: dataBoldFont, border: thinBorder });
    grandRow.getCell(2).alignment = centerAlign;
    grandRow.getCell(10).alignment = rightAlign;
    grandRow.getCell(11).alignment = rightAlign;
    grandRow.getCell(13).alignment = rightAlign;

    const sellGrandRowIdx = sellRowIdx;
    sellRowIdx++;

    // TCT (Tax Office Total - Accountant verification copy)
    const tctRowIdx = sellRowIdx;
    wsSell.getRow(tctRowIdx).height = 22;
    wsSell.getCell(`I${tctRowIdx}`).value = 'TCT';
    wsSell.getCell(`J${tctRowIdx}`).value = { formula: `=J${sellGrandRowIdx}` };
    wsSell.getCell(`K${tctRowIdx}`).value = { formula: `=K${sellGrandRowIdx}` };
    wsSell.getCell(`J${tctRowIdx}`).numFmt = '#,##0';
    wsSell.getCell(`K${tctRowIdx}`).numFmt = '#,##0';

    styleRange(wsSell, tctRowIdx, 2, tctRowIdx, 13, { font: dataBoldFont, border: thinBorder });
    wsSell.getCell(`I${tctRowIdx}`).alignment = centerAlign;
    wsSell.getCell(`J${tctRowIdx}`).alignment = rightAlign;
    wsSell.getCell(`K${tctRowIdx}`).alignment = rightAlign;
    sellRowIdx++;

    // CL (Difference) Row
    const clRowIdx = sellRowIdx;
    wsSell.getRow(clRowIdx).height = 22;
    wsSell.mergeCells(`B${clRowIdx}:H${clRowIdx}`);
    wsSell.getCell(`B${clRowIdx}`).value = 'Tổng doanh thu hàng hoá, dịch vụ bán ra chịu thuế GTGT (*):             ............................';
    wsSell.getCell(`I${clRowIdx}`).value = 'CL';
    wsSell.getCell(`J${clRowIdx}`).value = { formula: `=J${sellGrandRowIdx}-J${tctRowIdx}` };
    wsSell.getCell(`K${clRowIdx}`).value = { formula: `=K${sellGrandRowIdx}-K${tctRowIdx}` };
    wsSell.getCell(`J${clRowIdx}`).numFmt = '#,##0';
    wsSell.getCell(`K${clRowIdx}`).numFmt = '#,##0';

    styleRange(wsSell, clRowIdx, 2, clRowIdx, 13, { font: dataBoldFont, border: thinBorder });
    wsSell.getCell(`B${clRowIdx}`).alignment = leftAlign;
    wsSell.getCell(`I${clRowIdx}`).alignment = centerAlign;
    wsSell.getCell(`J${clRowIdx}`).alignment = rightAlign;
    wsSell.getCell(`K${clRowIdx}`).alignment = rightAlign;
    sellRowIdx++;

    // Text Label Row
    const labelRowIdx = sellRowIdx;
    wsSell.getRow(labelRowIdx).height = 22;
    wsSell.mergeCells(`B${labelRowIdx}:H${labelRowIdx}`);
    wsSell.getCell(`B${labelRowIdx}`).value = 'Tổng số thuế GTGT của hàng hóa, dịch vụ bán ra (**):   ............................';
    for (let col = 2; col <= 8; col++) {
      wsSell.getCell(labelRowIdx, col).font = dataBoldFont;
    }
    sellRowIdx += 2;

    // Signatures
    const sigRowIdx = sellRowIdx;
    wsSell.getCell(`J${sigRowIdx}`).value = `TP. Hồ Chí Minh, ngày ${new Date().getDate().toString().padStart(2, '0')} tháng ${(new Date().getMonth() + 1).toString().padStart(2, '0')} năm ${new Date().getFullYear()}`;
    wsSell.getCell(`J${sigRowIdx}`).font = italicFont;
    wsSell.getCell(`J${sigRowIdx}`).alignment = centerAlign;
    sellRowIdx++;

    wsSell.getCell(`J${sellRowIdx}`).value = 'NGƯỜI NỘP THUẾ hoặc';
    wsSell.getCell(`J${sellRowIdx}`).font = dataBoldFont;
    wsSell.getCell(`J${sellRowIdx}`).alignment = centerAlign;
    sellRowIdx++;

    wsSell.getCell(`J${sellRowIdx}`).value = 'ĐẠI DIỆN HỢP PHÁP CỦA NGƯỜI NỘP THUẾ';
    wsSell.getCell(`J${sellRowIdx}`).font = dataBoldFont;
    wsSell.getCell(`J${sellRowIdx}`).alignment = centerAlign;
    sellRowIdx++;

    wsSell.getCell(`J${sellRowIdx}`).value = ' Ký tên, đóng dấu (ghi rõ họ tên và chức vụ)';
    wsSell.getCell(`J${sellRowIdx}`).font = italicFont;
    wsSell.getCell(`J${sellRowIdx}`).alignment = centerAlign;


    // =========================================================
    // SHEET 2: MUA VÀO
    // =========================================================
    const wsBuy = workbook.addWorksheet('MUA VÀO', { views: [{ showGridLines: true }] });
    
    // Set widths exactly matching template
    const buyColWidths = [8.38, 8.13, 9.13, 10.38, 11.13, 13.38, 38.88, 21.38, 35.75, 21.38, 12.00, 24.13, 13.88, 22.38];
    buyColWidths.forEach((w, i) => {
      wsBuy.getColumn(i + 1).width = w;
    });

    wsBuy.getRow(1).height = 15;
    
    wsBuy.mergeCells('B1:M1');
    wsBuy.getCell('B1').value = 'BẢNG KÊ HOÁ ĐƠN, CHỨNG TỪ HÀNG HOÁ, DỊCH VỤ MUA VÀO';
    styleRange(wsBuy, 1, 2, 1, 13, { font: titleFont, alignment: headerAlign });
    wsBuy.getRow(1).height = 25;

    wsBuy.mergeCells('B2:M2');
    wsBuy.getCell('B2').value = '(Kèm theo tờ khai thuế GTGT theo mẫu số 01/GTGT)';
    styleRange(wsBuy, 2, 2, 2, 13, { font: subtitleFont, alignment: headerAlign });
    wsBuy.getRow(2).height = 20;

    wsBuy.mergeCells('B3:M3');
    wsBuy.getCell('B3').value = periodStr;
    styleRange(wsBuy, 3, 2, 3, 13, { font: dataFont, alignment: headerAlign });
    wsBuy.getRow(3).height = 20;

    wsBuy.getRow(4).height = 15;

    wsBuy.mergeCells('B5:M5');
    wsBuy.getCell('B5').value = 'Người nộp thuế:  ' + taxpayerName;
    styleRange(wsBuy, 5, 2, 5, 13, { font: titleFont, alignment: leftAlign });
    wsBuy.getRow(5).height = 20;

    wsBuy.mergeCells('B6:M6');
    wsBuy.getCell('B6').value = 'Mã số thuế: ' + taxpayerTaxCode;
    styleRange(wsBuy, 6, 2, 6, 13, { font: titleFont, alignment: leftAlign });
    wsBuy.getRow(6).height = 20;

    wsBuy.mergeCells('B7:M7');
    wsBuy.getCell('B7').value = 'Đơn vị tiền: đồng Việt Nam';
    styleRange(wsBuy, 7, 2, 7, 13, { font: italicFont, alignment: leftAlign });
    wsBuy.getRow(7).height = 20;

    // Table Headers
    wsBuy.mergeCells('B8:B10');
    wsBuy.getCell('B8').value = 'STT';
    styleRange(wsBuy, 8, 2, 10, 2, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsBuy.mergeCells('C8:F9');
    styleRange(wsBuy, 8, 3, 9, 6, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsBuy.getCell('C10').value = 'Ký hiệu mẫu hóa đơn';
    styleRange(wsBuy, 10, 3, 10, 3, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsBuy.getCell('D10').value = 'Ký hiệu hoá đơn';
    styleRange(wsBuy, 10, 4, 10, 4, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsBuy.getCell('E10').value = 'Số hoá đơn';
    styleRange(wsBuy, 10, 5, 10, 5, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsBuy.getCell('F10').value = 'Ngày, tháng, năm lập hóa đơn';
    styleRange(wsBuy, 10, 6, 10, 6, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsBuy.mergeCells('G8:G10');
    wsBuy.getCell('G8').value = 'Tên người bán';
    styleRange(wsBuy, 8, 7, 10, 7, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsBuy.mergeCells('H8:H10');
    wsBuy.getCell('H8').value = 'Mã số thuế người bán';
    styleRange(wsBuy, 8, 8, 10, 8, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsBuy.mergeCells('I8:I10');
    wsBuy.getCell('I8').value = 'Mặt hàng';
    styleRange(wsBuy, 8, 9, 10, 9, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsBuy.mergeCells('J8:J10');
    wsBuy.getCell('J8').value = 'Doanh số mua chưa có thuế';
    styleRange(wsBuy, 8, 10, 10, 10, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsBuy.mergeCells('K8:K10');
    wsBuy.getCell('K8').value = 'Thuế suất';
    styleRange(wsBuy, 8, 11, 10, 11, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsBuy.mergeCells('L8:L10');
    wsBuy.getCell('L8').value = 'Thuế GTGT\nđủ điều kiện khấu trừ thuế';
    styleRange(wsBuy, 8, 12, 10, 12, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsBuy.mergeCells('M8:M10');
    wsBuy.getCell('M8').value = 'GHI CHÚ';
    styleRange(wsBuy, 8, 13, 10, 13, { font: headerFont, alignment: headerAlign, border: thinBorder });

    wsBuy.getRow(8).height = 15;
    wsBuy.getRow(9).height = 15;
    wsBuy.getRow(10).height = 25;

    // Row 11: indices
    const row11Buy = wsBuy.getRow(11);
    row11Buy.height = 20;
    const indicesBuy = ['[1]', '[2]', '[3]', '', '', '[4]', '[5]', '[6]', '[7]', '[8]', '[9]', '[10]'];
    indicesBuy.forEach((val, idx) => {
      row11Buy.getCell(idx + 2).value = val;
    });
    styleRange(wsBuy, 11, 2, 11, 13, { font: dataFont, alignment: centerAlign, border: thinBorder });

    let buyRowIdx = 12;

    // Section 1 Header
    wsBuy.mergeCells(`B${buyRowIdx}:M${buyRowIdx}`);
    wsBuy.getCell(`B${buyRowIdx}`).value = '1. Hàng hoá, dịch vụ dùng riêng cho SXKD chịu thuế GTGT và sử dụng cho các hoạt động cung cấp hàng hoá, dịch vụ không kê khai, nộp thuế GTGT đủ điều kiện khấu trừ thuế: ';
    styleRange(wsBuy, buyRowIdx, 2, buyRowIdx, 13, { font: sectionFont, alignment: leftAlign, border: thinBorder });
    wsBuy.getRow(buyRowIdx).height = 22;
    buyRowIdx++;

    const s1Start = buyRowIdx;
    
    // Put ALL purchase invoices under Section 1 as required
    buyInvoices.forEach((inv, idx) => {
      const row = wsBuy.getRow(buyRowIdx);
      row.height = 22;

      row.getCell(2).value = String(idx + 1).padStart(2, '0');
      row.getCell(3).value = inv.templateSymbol || '';
      row.getCell(4).value = inv.invoiceSymbol || '';
      
      const num = parseInt(inv.invoiceNumber, 10);
      row.getCell(5).value = isNaN(num) ? inv.invoiceNumber : num;

      row.getCell(6).value = new Date(inv.invoiceDate);
      row.getCell(6).numFmt = 'dd/mm/yyyy';

      row.getCell(7).value = inv.sellerName || '';
      row.getCell(8).value = inv.sellerTaxCode || '';
      row.getCell(9).value = inv.items.map((item: any) => item.name).join(', ');

      row.getCell(10).value = inv.totalBeforeTax;
      row.getCell(10).numFmt = '#,##0';

      // Parse tax rate and format
      let rateVal: any = inv.items[0]?.taxRate;
      let isPct = false;
      if (rateVal) {
        const match = rateVal.match(/(\d+)%/);
        if (match) {
          const numVal = parseFloat(match[1]);
          if (!isNaN(numVal)) {
            rateVal = numVal / 100;
            isPct = true;
          }
        } else if (!isNaN(parseFloat(rateVal))) {
          rateVal = parseFloat(rateVal) / 100;
          isPct = true;
        }
      }
      row.getCell(11).value = rateVal;
      if (isPct) {
        row.getCell(11).numFmt = '0%';
      }

      row.getCell(12).value = inv.taxAmount;
      row.getCell(12).numFmt = '#,##0';

      row.getCell(13).value = { formula: `=IF(N${buyRowIdx}>=5000000,"CK","TM")` };
      row.getCell(14).value = { formula: `=J${buyRowIdx}+L${buyRowIdx}` };
      row.getCell(14).numFmt = '#,##0';

      styleRange(wsBuy, buyRowIdx, 2, buyRowIdx, 14, { font: dataFont, border: thinBorder });

      row.getCell(2).alignment = centerAlign;
      row.getCell(3).alignment = centerAlign;
      row.getCell(4).alignment = centerAlign;
      row.getCell(5).alignment = centerAlign;
      row.getCell(6).alignment = centerAlign;
      row.getCell(7).alignment = leftAlign;
      row.getCell(8).alignment = centerAlign;
      row.getCell(9).alignment = leftAlign;
      row.getCell(10).alignment = rightAlign;
      row.getCell(11).alignment = centerAlign;
      row.getCell(12).alignment = rightAlign;
      row.getCell(13).alignment = centerAlign;
      row.getCell(14).alignment = rightAlign;

      buyRowIdx++;
    });

    const s1End = buyRowIdx - 1;

    // Section 1 Total
    const s1TotalRowIdx = buyRowIdx;
    wsBuy.getRow(s1TotalRowIdx).height = 24;
    wsBuy.getCell(`B${s1TotalRowIdx}`).value = 'Tổng';
    if (buyInvoices.length > 0) {
      wsBuy.getCell(`J${s1TotalRowIdx}`).value = { formula: `=SUM(J${s1Start}:J${s1End})` };
      wsBuy.getCell(`L${s1TotalRowIdx}`).value = { formula: `=SUM(L${s1Start}:L${s1End})` };
      wsBuy.getCell(`N${s1TotalRowIdx}`).value = { formula: `=SUM(N${s1Start}:N${s1End})` };
    } else {
      wsBuy.getCell(`J${s1TotalRowIdx}`).value = 0;
      wsBuy.getCell(`L${s1TotalRowIdx}`).value = 0;
      wsBuy.getCell(`N${s1TotalRowIdx}`).value = 0;
    }
    wsBuy.getCell(`J${s1TotalRowIdx}`).numFmt = '#,##0';
    wsBuy.getCell(`L${s1TotalRowIdx}`).numFmt = '#,##0';
    wsBuy.getCell(`N${s1TotalRowIdx}`).numFmt = '#,##0';

    styleRange(wsBuy, s1TotalRowIdx, 2, s1TotalRowIdx, 14, { font: dataBoldFont, border: thinBorder });
    wsBuy.getCell(`B${s1TotalRowIdx}`).alignment = centerAlign;
    wsBuy.getCell(`J${s1TotalRowIdx}`).alignment = rightAlign;
    wsBuy.getCell(`L${s1TotalRowIdx}`).alignment = rightAlign;
    wsBuy.getCell(`N${s1TotalRowIdx}`).alignment = rightAlign;
    buyRowIdx++;

    // Section 3 Header (Investment Project)
    wsBuy.mergeCells(`B${buyRowIdx}:M${buyRowIdx}`);
    wsBuy.getCell(`B${buyRowIdx}`).value = '3. Hàng hóa, dịch vụ dùng cho dự án đầu tư đủ điều kiện được khấu trừ thuế (*):';
    styleRange(wsBuy, buyRowIdx, 2, buyRowIdx, 13, { font: sectionFont, alignment: leftAlign, border: thinBorder });
    wsBuy.getRow(buyRowIdx).height = 22;
    buyRowIdx++;

    // Section 3 Total (empty)
    const s3TotalRowIdx = buyRowIdx;
    wsBuy.getRow(s3TotalRowIdx).height = 24;
    wsBuy.getCell(`B${s3TotalRowIdx}`).value = 'Tổng';
    wsBuy.getCell(`J${s3TotalRowIdx}`).value = 0;
    wsBuy.getCell(`L${s3TotalRowIdx}`).value = 0;
    wsBuy.getCell(`N${s3TotalRowIdx}`).value = 0;
    wsBuy.getCell(`J${s3TotalRowIdx}`).numFmt = '#,##0';
    wsBuy.getCell(`L${s3TotalRowIdx}`).numFmt = '#,##0';
    wsBuy.getCell(`N${s3TotalRowIdx}`).numFmt = '#,##0';

    styleRange(wsBuy, s3TotalRowIdx, 2, s3TotalRowIdx, 14, { font: dataBoldFont, border: thinBorder });
    wsBuy.getCell(`B${s3TotalRowIdx}`).alignment = centerAlign;
    wsBuy.getCell(`J${s3TotalRowIdx}`).alignment = rightAlign;
    wsBuy.getCell(`L${s3TotalRowIdx}`).alignment = rightAlign;
    wsBuy.getCell(`N${s3TotalRowIdx}`).alignment = rightAlign;
    buyRowIdx++;

    // Section 5 Header (Not compiled)
    wsBuy.mergeCells(`B${buyRowIdx}:M${buyRowIdx}`);
    wsBuy.getCell(`B${buyRowIdx}`).value = '5. Hàng hóa, dịch vụ không phải tổng hợp trên tờ khai 01/GTGT:';
    styleRange(wsBuy, buyRowIdx, 2, buyRowIdx, 13, { font: sectionFont, alignment: leftAlign, border: thinBorder });
    wsBuy.getRow(buyRowIdx).height = 22;
    buyRowIdx++;

    // Grand Total Row
    const grandRowBuyIdx = buyRowIdx;
    wsBuy.getRow(grandRowBuyIdx).height = 24;
    wsBuy.getCell(`B${grandRowBuyIdx}`).value = 'Tổng';
    wsBuy.getCell(`J${grandRowBuyIdx}`).value = { formula: `=J${s1TotalRowIdx}+J${s3TotalRowIdx}` };
    wsBuy.getCell(`L${grandRowBuyIdx}`).value = { formula: `=L${s1TotalRowIdx}+L${s3TotalRowIdx}` };
    wsBuy.getCell(`N${grandRowBuyIdx}`).value = { formula: `=J${grandRowBuyIdx}+L${grandRowBuyIdx}` };

    wsBuy.getCell(`J${grandRowBuyIdx}`).numFmt = '#,##0';
    wsBuy.getCell(`L${grandRowBuyIdx}`).numFmt = '#,##0';
    wsBuy.getCell(`N${grandRowBuyIdx}`).numFmt = '#,##0';

    styleRange(wsBuy, grandRowBuyIdx, 2, grandRowBuyIdx, 14, { font: dataBoldFont, border: thinBorder });
    wsBuy.getCell(`B${grandRowBuyIdx}`).alignment = centerAlign;
    wsBuy.getCell(`J${grandRowBuyIdx}`).alignment = rightAlign;
    wsBuy.getCell(`L${grandRowBuyIdx}`).alignment = rightAlign;
    wsBuy.getCell(`N${grandRowBuyIdx}`).alignment = rightAlign;
    buyRowIdx++;

    // Signature labels
    const buyLabel1Idx = buyRowIdx;
    wsBuy.getRow(buyLabel1Idx).height = 22;
    wsBuy.mergeCells(`B${buyLabel1Idx}:H${buyLabel1Idx}`);
    wsBuy.getCell(`B${buyLabel1Idx}`).value = 'Tổng giá trị HHDV mua vào phục vụ SXKD được khấu trừ thuế GTGT (**):              ............................';
    for (let col = 2; col <= 8; col++) {
      wsBuy.getCell(buyLabel1Idx, col).font = dataBoldFont;
    }
    buyRowIdx++;

    const buyLabel2Idx = buyRowIdx;
    wsBuy.getRow(buyLabel2Idx).height = 22;
    wsBuy.mergeCells(`B${buyLabel2Idx}:H${buyLabel2Idx}`);
    wsBuy.getCell(`B${buyLabel2Idx}`).value = 'Tổng số thuế GTGT của HHDV mua vào đủ điều kiện được khấu trừ (***):          ............................';
    for (let col = 2; col <= 8; col++) {
      wsBuy.getCell(buyLabel2Idx, col).font = dataBoldFont;
    }
    buyRowIdx += 2;

    // Date & signatures
    const sigBuyRowIdx = buyRowIdx;
    wsBuy.getRow(sigBuyRowIdx).height = 22;
    wsBuy.getCell(`J${sigBuyRowIdx}`).value = { formula: `='BÁN RA'!J${sigRowIdx}` };
    wsBuy.getCell(`J${sigBuyRowIdx}`).font = italicFont;
    wsBuy.getCell(`J${sigBuyRowIdx}`).alignment = centerAlign;
    buyRowIdx++;

    wsBuy.getCell(`J${buyRowIdx}`).value = 'NGƯỜI NỘP THUẾ hoặc';
    wsBuy.getCell(`J${buyRowIdx}`).font = dataBoldFont;
    wsBuy.getCell(`J${buyRowIdx}`).alignment = centerAlign;
    buyRowIdx++;

    wsBuy.getCell(`J${buyRowIdx}`).value = 'ĐẠI DIỆN HỢP PHÁP CỦA NGƯỜI NỘP THUẾ';
    wsBuy.getCell(`J${buyRowIdx}`).font = dataBoldFont;
    wsBuy.getCell(`J${buyRowIdx}`).alignment = centerAlign;
    buyRowIdx++;

    wsBuy.getCell(`J${buyRowIdx}`).value = ' Ký tên, đóng dấu (ghi rõ họ tên và chức vụ)';
    wsBuy.getCell(`J${buyRowIdx}`).font = italicFont;
    wsBuy.getCell(`J${buyRowIdx}`).alignment = centerAlign;

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

