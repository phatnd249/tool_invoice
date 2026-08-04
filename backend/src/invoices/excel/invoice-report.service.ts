import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { ExcelBaseService } from './excel-base.service';
import { ParsedInvoice } from '../excel.service';

/**
 * Report 1: Tổng hợp hoá đơn.
 * - Sheet tổng quan (TongQuan_HoaDon)
 * - Mỗi hoá đơn có 1 sheet detail riêng
 */
@Injectable()
export class InvoiceReportService extends ExcelBaseService {
  async generate(invoices: ParsedInvoice[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Build unique sheet names
    const sheetNamesMap = new Map<string, string>();
    const usedNames = new Set<string>();

    invoices.forEach((inv) => {
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

    // ── Sheet: TongQuan_HoaDon ──
    const summarySheet = workbook.addWorksheet('TongQuan_HoaDon', {
      views: [{ showGridLines: true }],
    });

    summarySheet.mergeCells('A1:N1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = 'BẢNG TỔNG HỢP HÓA ĐƠN ĐIỆN TỬ';
    titleCell.font = this.titleFont;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    summarySheet.getRow(1).height = 40;

    summarySheet.getCell('A2').value = `Ngày xuất báo cáo: ${new Date().toLocaleString('vi-VN')}`;
    summarySheet.getCell('A2').font = this.italicFont;
    summarySheet.getRow(2).height = 20;

    const headers = [
      'STT',
      'Số Hóa Đơn',
      'Ngày Lập',
      'Mã Tra Cứu',
      'Mã CQ Thuế (MCCQT)',
      'MST Người Mua',
      'Tên Người Mua',
      'Tiền Trước Thuế',
      'Tiền Thuế',
      'Tổng Cộng Thanh Toán',
      'Hình Thức TT',
      'Tiền Bằng Chữ',
      'Chi Tiết Hàng Hóa',
      'Tên Tệp XML',
    ];

    summarySheet.getRow(3).height = 28;
    headers.forEach((h, idx) => {
      const cell = summarySheet.getCell(3, idx + 1);
      cell.value = h;
      cell.font = this.headerFont;
      cell.fill = this.headerFill;
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = this.thinBorder;
    });

    let startRow = 4;
    invoices.forEach((inv, index) => {
      const row = summarySheet.getRow(startRow);
      row.height = 22;

      const formattedNo = this.formatInvoiceNumber(inv.invoiceNumber);
      const invoiceDateStr = this.formatDate(inv.invoiceDate);

      row.getCell(1).value = index + 1;
      row.getCell(2).value = formattedNo;
      row.getCell(3).value = invoiceDateStr;
      row.getCell(4).value = inv.lookupCode || '';
      row.getCell(5).value = inv.taxAuthorityCode || '';
      row.getCell(6).value = inv.buyerTaxCode;
      row.getCell(7).value = inv.buyerName;
      row.getCell(8).value = inv.totalBeforeTax;
      row.getCell(9).value = inv.taxAmount;
      row.getCell(10).value = inv.totalAmount;
      row.getCell(11).value = inv.paymentMethod || '';
      row.getCell(12).value = inv.totalAmountInWords || '';

      const invoiceKey = `${inv.invoiceNumber}_${inv.sellerTaxCode}_${inv.buyerTaxCode}`;
      const subSheetName =
        sheetNamesMap.get(invoiceKey) || `HD_${inv.invoiceNumber}`;
      row.getCell(13).value = {
        text: 'Xem chi tiết',
        hyperlink: `#${subSheetName}!A1`,
      };
      row.getCell(13).font = this.linkFont;

      row.getCell(14).value = inv.xmlFile;

      // Alignments
      [1, 2, 3, 4, 5, 6, 11, 13].forEach((c) => {
        row.getCell(c).alignment = {
          horizontal: 'center',
          vertical: 'middle',
        };
      });
      [7, 12, 14].forEach((c) => {
        row.getCell(c).alignment = {
          horizontal: 'left',
          vertical: 'middle',
          wrapText: true,
        };
      });
      [8, 9, 10].forEach((c) => {
        row.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(c).numFmt = '#,##0';
      });

      const isEven = startRow % 2 === 0;
      for (let col = 1; col <= 14; col++) {
        const cell = row.getCell(col);
        if (col !== 13) cell.font = this.dataFont;
        cell.border = this.thinBorder;
        if (isEven) cell.fill = this.zebraFill;
      }

      startRow++;
    });

    // Total row
    const totalRow = summarySheet.getRow(startRow);
    totalRow.height = 24;
    summarySheet.mergeCells(`A${startRow}:G${startRow}`);
    totalRow.getCell(1).value = 'TỔNG CỘNG';
    totalRow.getCell(1).font = this.totalFont;
    totalRow.getCell(1).alignment = {
      horizontal: 'right',
      vertical: 'middle',
    };

    const lastDataRow = startRow - 1;
    [8, 9, 10].forEach((col) => {
      const cell = totalRow.getCell(col);
      cell.value = {
        formula: `SUM(${String.fromCharCode(64 + col)}4:${String.fromCharCode(64 + col)}${lastDataRow})`,
        result: 0,
      };
      cell.font = this.totalFont;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.numFmt = '#,##0';
    });

    for (let col = 1; col <= 14; col++) {
      totalRow.getCell(col).border = this.totalBorder;
      totalRow.getCell(col).fill = this.totalFill;
    }

    // ── Detail sheets ──
    invoices.forEach((inv) => {
      const invoiceKey = `${inv.invoiceNumber}_${inv.sellerTaxCode}_${inv.buyerTaxCode}`;
      const subSheetName =
        sheetNamesMap.get(invoiceKey) || `HD_${inv.invoiceNumber}`;
      const subSheet = workbook.addWorksheet(subSheetName, {
        views: [{ showGridLines: true }],
      });

      subSheet.mergeCells('A1:G1');
      const subTitle = subSheet.getCell('A1');
      subTitle.value = `CHI TIẾT HÀNG HÓA DỊCH VỤ HÓA ĐƠN SỐ ${this.formatInvoiceNumber(inv.invoiceNumber)}`;
      subTitle.font = this.titleFont;
      subTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      subSheet.getRow(1).height = 35;

      subSheet.getCell('A2').value = {
        text: '← Về trang tổng quan',
        hyperlink: `#TongQuan_HoaDon!A1`,
      };
      subSheet.getCell('A2').font = this.linkFont;
      subSheet.getRow(2).height = 20;

      subSheet.getCell(
        'A3',
      ).value = `Người bán: ${inv.sellerName} (MST: ${inv.sellerTaxCode})`;
      subSheet.getCell('A3').font = this.dataFont;
      subSheet.getCell(
        'A4',
      ).value = `Người mua: ${inv.buyerName} (MST: ${inv.buyerTaxCode})`;
      subSheet.getCell('A4').font = this.dataFont;

      subSheet.getRow(3).height = 18;
      subSheet.getRow(4).height = 18;
      subSheet.getRow(5).height = 10;

      const subHeaders = [
        'STT',
        'Tên Hàng Hóa, Dịch Vụ',
        'Đơn Vị Tính',
        'Số Lượng',
        'Đơn Giá',
        'Thành Tiền (Chưa Thuế)',
        'Thuế Suất',
      ];
      subSheet.getRow(6).height = 26;
      subHeaders.forEach((sh, idx) => {
        const cell = subSheet.getCell(6, idx + 1);
        cell.value = sh;
        cell.font = this.headerFont;
        cell.fill = this.headerFill;
        cell.alignment = {
          horizontal: 'center',
          vertical: 'middle',
          wrapText: true,
        };
        cell.border = this.thinBorder;
      });

      let subStartRow = 7;
      inv.items.forEach((item) => {
        const row = subSheet.getRow(subStartRow);
        row.height = 22;

        row.getCell(1).value = item.lineNumber
          ? parseInt(item.lineNumber) || item.lineNumber
          : '';
        row.getCell(2).value = item.name;
        row.getCell(3).value = item.unit || '';
        row.getCell(4).value = item.quantity;
        row.getCell(5).value = item.price;
        row.getCell(6).value = item.amount;
        row.getCell(7).value = item.taxRate || '';

        row.getCell(1).alignment = {
          horizontal: 'center',
          vertical: 'middle',
        };
        row.getCell(2).alignment = {
          horizontal: 'left',
          vertical: 'middle',
          wrapText: true,
        };
        row.getCell(3).alignment = {
          horizontal: 'center',
          vertical: 'middle',
        };
        [4, 5, 6].forEach((c) => {
          row.getCell(c).alignment = {
            horizontal: 'right',
            vertical: 'middle',
          };
        });
        row.getCell(4).numFmt = '#,##0.00';
        row.getCell(5).numFmt = '#,##0';
        row.getCell(6).numFmt = '#,##0';
        row.getCell(7).alignment = {
          horizontal: 'center',
          vertical: 'middle',
        };

        const isSubEven = subStartRow % 2 === 0;
        for (let col = 1; col <= 7; col++) {
          const cell = row.getCell(col);
          cell.font = this.dataFont;
          cell.border = this.thinBorder;
          if (isSubEven) cell.fill = this.zebraFill;
        }

        subStartRow++;
      });

      // Sub total
      const subTotalRow = subSheet.getRow(subStartRow);
      subTotalRow.height = 24;
      subSheet.mergeCells(`A${subStartRow}:E${subStartRow}`);
      subTotalRow.getCell(1).value = 'TỔNG CỘNG CHI TIẾT THÀNH TIỀN';
      subTotalRow.getCell(1).font = this.totalFont;
      subTotalRow.getCell(1).alignment = {
        horizontal: 'right',
        vertical: 'middle',
      };

      const subLastDataRow = subStartRow - 1;
      const amountSumCell = subTotalRow.getCell(6);
      amountSumCell.value = {
        formula: `SUM(F7:F${subLastDataRow})`,
        result: 0,
      };
      amountSumCell.font = this.totalFont;
      amountSumCell.alignment = { horizontal: 'right', vertical: 'middle' };
      amountSumCell.numFmt = '#,##0';

      for (let col = 1; col <= 7; col++) {
        subTotalRow.getCell(col).border = this.totalBorder;
        subTotalRow.getCell(col).fill = this.totalFill;
      }
    });

    // Auto-fit columns
    workbook.worksheets.forEach((ws) => {
      ws.columns.forEach((col) => {
        let maxLen = 0;
        col.eachCell!({ includeEmpty: false }, (cell) => {
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
