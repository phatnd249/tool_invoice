import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { ExcelBaseService } from './excel-base.service';
import { ParsedInvoice } from '../excel.service';

/**
 * Report 2: Bảng kê 01/GTGT (Module 7).
 * - Sheet BÁN RA: phân nhóm theo thuế suất
 * - Sheet MUA VÀO: bảng kê mua vào
 */
@Injectable()
export class Module7ReportService extends ExcelBaseService {
  async generate(
    invoices: (ParsedInvoice & { type: string })[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    const fontName = 'Times New Roman';
    const m7TitleFont = { name: fontName, size: 13, bold: true };
    const m7SubtitleFont = { name: fontName, size: 13, italic: true };
    const m7HeaderFont = { name: fontName, size: 13, bold: true };
    const m7SectionFont = { name: fontName, size: 13, bold: true };
    const m7DataFont = { name: fontName, size: 13 };
    const m7DataBoldFont = { name: fontName, size: 13, bold: true };
    const m7ItalicFont = { name: fontName, size: 13, italic: true };

    const headerAlign: Partial<ExcelJS.Alignment> = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    const leftAlign: Partial<ExcelJS.Alignment> = {
      horizontal: 'left',
      vertical: 'middle',
      wrapText: true,
    };
    const rightAlign: Partial<ExcelJS.Alignment> = {
      horizontal: 'right',
      vertical: 'middle',
    };
    const centerAlign: Partial<ExcelJS.Alignment> = {
      horizontal: 'center',
      vertical: 'middle',
    };

    const blackBorder: any = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };

    // ── Determine taxpayer info ──
    const sellInvoices = invoices.filter((inv) => inv.type === 'SELL');
    const buyInvoices = invoices.filter((inv) => inv.type === 'BUY');

    let taxpayerName = '';
    let taxpayerTaxCode = '';

    if (sellInvoices.length > 0) {
      taxpayerName = sellInvoices[0].sellerName;
      taxpayerTaxCode = sellInvoices[0].sellerTaxCode;
    } else if (buyInvoices.length > 0) {
      taxpayerName = buyInvoices[0].buyerName;
      taxpayerTaxCode = buyInvoices[0].buyerTaxCode;
    }

    // Period string
    let periodStr = '';
    if (invoices.length > 0) {
      const dates = invoices.map((inv) => new Date(inv.invoiceDate));
      const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
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
            periodStr = `Kỳ tính thuế: Từ ngày ${this.formatDate(minDate)} đến ngày ${this.formatDate(maxDate)}`;
          }
        }
      } else {
        periodStr = `Kỳ tính thuế: Từ ngày ${this.formatDate(minDate)} đến ngày ${this.formatDate(maxDate)}`;
      }
    }

    // Tax group helper
    const getTaxGroup = (taxRateStr: string | null | undefined): number => {
      if (!taxRateStr) return 1;
      const r = taxRateStr.toUpperCase().replace(/\s%/g, '').trim();
      if (
        r.includes('KKKNT') ||
        r.includes('KHN') ||
        r.includes('KKNT') ||
        r.includes('KTPTH')
      )
        return 5;
      if (r.includes('KCT') || r.includes('KHONGCHIUTHUE')) return 1;
      if (r.includes('0') || r === '0%') return 2;
      if (r.includes('5') || r === '5%') return 50;
      if (r.includes('8') || r === '8%') return 8;
      if (r.includes('10') || r === '10%') return 10;
      return 1;
    };

    // ── Sheet: BÁN RA ──
    const sigRowIdx = this.buildSellSheet(
      workbook,
      sellInvoices,
      taxpayerName,
      taxpayerTaxCode,
      periodStr,
      getTaxGroup,
      m7TitleFont,
      m7SubtitleFont,
      m7HeaderFont,
      m7SectionFont,
      m7DataFont,
      m7DataBoldFont,
      m7ItalicFont,
      headerAlign,
      leftAlign,
      rightAlign,
      centerAlign,
      blackBorder,
    );

    // ── Sheet: MUA VÀO ──
    this.buildBuySheet(
      workbook,
      buyInvoices,
      taxpayerName,
      taxpayerTaxCode,
      periodStr,
      sigRowIdx,
      m7TitleFont,
      m7SubtitleFont,
      m7HeaderFont,
      m7SectionFont,
      m7DataFont,
      m7DataBoldFont,
      m7ItalicFont,
      headerAlign,
      leftAlign,
      rightAlign,
      centerAlign,
      blackBorder,
    );

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Sheet: BÁN RA
  // ═══════════════════════════════════════════════════════════════════════════

  private buildSellSheet(
    workbook: ExcelJS.Workbook,
    sellInvoices: (ParsedInvoice & { type: string })[],
    taxpayerName: string,
    taxpayerTaxCode: string,
    periodStr: string,
    getTaxGroup: (s: string | null | undefined) => number,
    m7TitleFont: any,
    m7SubtitleFont: any,
    m7HeaderFont: any,
    m7SectionFont: any,
    m7DataFont: any,
    m7DataBoldFont: any,
    m7ItalicFont: any,
    headerAlign: any,
    leftAlign: any,
    rightAlign: any,
    centerAlign: any,
    blackBorder: any,
  ): number {
    const wsSell = workbook.addWorksheet('BÁN RA', {
      views: [{ showGridLines: true }],
    });

    const sellColWidths = [
      8.38, 8.13, 9.13, 10.38, 11.13, 13.38, 38.88, 21.38, 35.75, 21.38, 24.13,
      13.88, 22.38, 28.63,
    ];
    sellColWidths.forEach((w, i) => (wsSell.getColumn(i + 1).width = w));
    wsSell.getRow(1).height = 15;

    wsSell.mergeCells('B2:L2');
    wsSell.getCell('B2').value =
      'BẢNG KÊ HOÁ ĐƠN, CHỨNG TỪ HÀNG HOÁ, DỊCH VỤ BÁN RA';
    this.styleRange(wsSell, 2, 2, 2, 12, {
      font: m7TitleFont,
      alignment: headerAlign,
    });
    wsSell.getRow(2).height = 25;

    wsSell.mergeCells('B3:L3');
    wsSell.getCell('B3').value =
      '(Kèm theo tờ khai thuế GTGT theo mẫu số 01/GTGT)';
    this.styleRange(wsSell, 3, 2, 3, 12, {
      font: m7SubtitleFont,
      alignment: headerAlign,
    });
    wsSell.getRow(3).height = 20;

    wsSell.mergeCells('B4:L4');
    wsSell.getCell('B4').value = periodStr;
    this.styleRange(wsSell, 4, 2, 4, 12, {
      font: m7DataFont,
      alignment: headerAlign,
    });
    wsSell.getRow(4).height = 20;

    wsSell.mergeCells('B5:L5');
    wsSell.getCell('B5').value = 'Người nộp thuế:  ' + taxpayerName;
    this.styleRange(wsSell, 5, 2, 5, 12, {
      font: m7TitleFont,
      alignment: leftAlign,
    });
    wsSell.getRow(5).height = 20;

    wsSell.mergeCells('B6:L6');
    wsSell.getCell('B6').value = 'Mã số thuế: ' + taxpayerTaxCode;
    this.styleRange(wsSell, 6, 2, 6, 12, {
      font: m7TitleFont,
      alignment: leftAlign,
    });
    wsSell.getRow(6).height = 20;

    wsSell.mergeCells('B7:L7');
    wsSell.getCell('B7').value = 'Đơn vị tiền: đồng Việt Nam';
    this.styleRange(wsSell, 7, 2, 7, 12, {
      font: m7ItalicFont,
      alignment: leftAlign,
    });
    wsSell.getRow(7).height = 20;

    // Headers - 3 rows merged
    wsSell.mergeCells('B8:B10');
    wsSell.getCell('B8').value = 'STT';
    this.styleRange(wsSell, 8, 2, 10, 2, {
      font: m7HeaderFont,
      alignment: headerAlign,
      border: blackBorder,
    });

    wsSell.mergeCells('C8:F9');
    this.styleRange(wsSell, 8, 3, 9, 6, {
      font: m7HeaderFont,
      alignment: headerAlign,
      border: blackBorder,
    });

    wsSell.getCell('C10').value = 'Ký hiệu mẫu hóa đơn';
    wsSell.getCell('D10').value = 'Ký hiệu hoá đơn';
    wsSell.getCell('E10').value = 'Số hoá đơn';
    wsSell.getCell('F10').value = 'Ngày, tháng, năm lập hóa đơn';
    this.styleRange(wsSell, 10, 3, 10, 6, {
      font: m7HeaderFont,
      alignment: headerAlign,
      border: blackBorder,
    });

    wsSell.mergeCells('G8:G10');
    wsSell.getCell('G8').value = 'Tên người mua';
    wsSell.mergeCells('H8:H10');
    wsSell.getCell('H8').value = 'Mã số thuế người mua';
    wsSell.mergeCells('I8:I10');
    wsSell.getCell('I8').value = 'Mặt hàng';
    wsSell.mergeCells('J8:J10');
    wsSell.getCell('J8').value = 'Doanh thu chưa có thuế GTGT';
    wsSell.mergeCells('K8:K10');
    wsSell.getCell('K8').value = 'Thuế GTGT';
    wsSell.mergeCells('L8:L10');
    wsSell.getCell('L8').value = 'Ghi chú';

    this.styleRange(wsSell, 8, 7, 10, 12, {
      font: m7HeaderFont,
      alignment: headerAlign,
      border: blackBorder,
    });
    wsSell.getRow(8).height = 15;
    wsSell.getRow(9).height = 15;
    wsSell.getRow(10).height = 25;

    // Index row
    const row11 = wsSell.getRow(11);
    row11.height = 20;
    const indicesSell = [
      '[1]',
      '[2]',
      '[3]',
      '[2]',
      '[3]',
      '[4]',
      '[5]',
      '[6]',
      '[7]',
      '[8]',
      '[9]',
    ];
    indicesSell.forEach((val, idx) => {
      row11.getCell(idx + 2).value = val;
    });
    this.styleRange(wsSell, 11, 2, 11, 12, {
      font: m7DataFont,
      alignment: centerAlign,
      border: blackBorder,
    });

    // Group selling invoices by tax rate
    const groups: { [key: number]: any[] } = {
      1: [],
      2: [],
      50: [],
      8: [],
      10: [],
      5: [],
    };
    sellInvoices.forEach((inv) => {
      const gr = getTaxGroup(inv.items[0]?.taxRate);
      if (groups[gr]) groups[gr].push(inv);
      else groups[1].push(inv);
    });

    const sellGroupConfigs = [
      {
        id: 1,
        label: '1. Hàng hóa, dịch vụ không chịu thuế giá trị gia tăng (GTGT):',
      },
      { id: 2, label: '2. Hàng hoá, dịch vụ chịu thuế suất thuế GTGT 0%:' },
      {
        id: 50,
        label: 'Hàng hoá, dịch vụ chịu thuế suất thuế GTGT 5%:',
        optional: true,
      },
      { id: 8, label: '3. Hàng hoá, dịch vụ chịu thuế suất thuế GTGT 8%:' },
      { id: 10, label: '4. Hàng hoá, dịch vụ chịu thuế suất thuế GTGT 10%:' },
      {
        id: 5,
        label: '5. Hàng hóa, dịch vụ không phải tổng hợp trên tờ khai 01/GTGT:',
      },
    ];

    let sellRowIdx = 12;
    const sellTotalRows: number[] = [];

    sellGroupConfigs.forEach((g) => {
      if (g.optional && groups[g.id].length === 0) return;

      wsSell.mergeCells(`B${sellRowIdx}:L${sellRowIdx}`);
      wsSell.getCell(`B${sellRowIdx}`).value = g.label;
      this.styleRange(wsSell, sellRowIdx, 2, sellRowIdx, 12, {
        font: m7SectionFont,
        alignment: leftAlign,
        border: blackBorder,
      });
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
        row.getCell(9).value = inv.items.map((item) => item.name).join(', ');

        row.getCell(10).value = inv.totalBeforeTax;
        row.getCell(10).numFmt = '#,##0';

        row.getCell(11).value = inv.taxAmount;
        row.getCell(11).numFmt = '#,##0';

        row.getCell(12).value = {
          formula: `=IF(M${sellRowIdx}>=5000000,"CK","TM")`,
        };
        row.getCell(13).value = {
          formula: `=J${sellRowIdx}+K${sellRowIdx}`,
        };
        row.getCell(13).numFmt = '#,##0';

        this.styleRange(wsSell, sellRowIdx, 2, sellRowIdx, 13, {
          font: m7DataFont,
          border: blackBorder,
        });
        [2, 3, 4, 5, 6, 8, 12].forEach((c) => {
          row.getCell(c).alignment = centerAlign;
        });
        [7, 9].forEach((c) => {
          row.getCell(c).alignment = leftAlign;
        });
        [10, 11, 13].forEach((c) => {
          row.getCell(c).alignment = rightAlign;
        });

        sellRowIdx++;
      });

      const endData = sellRowIdx - 1;

      // Section total
      const totalRow = wsSell.getRow(sellRowIdx);
      totalRow.height = 24;
      totalRow.getCell(2).value = 'Tổng';

      if (items.length > 0) {
        totalRow.getCell(10).value = {
          formula: `=SUM(J${startData}:J${endData})`,
        };
        totalRow.getCell(11).value = {
          formula: `=SUM(K${startData}:K${endData})`,
        };
        totalRow.getCell(13).value = {
          formula: `=SUM(M${startData}:M${endData})`,
        };
      } else {
        totalRow.getCell(10).value = 0;
        totalRow.getCell(11).value = 0;
        totalRow.getCell(13).value = 0;
      }

      totalRow.getCell(10).numFmt = '#,##0';
      totalRow.getCell(11).numFmt = '#,##0';
      totalRow.getCell(13).numFmt = '#,##0';

      this.styleRange(wsSell, sellRowIdx, 2, sellRowIdx, 13, {
        font: m7DataBoldFont,
        border: blackBorder,
      });
      totalRow.getCell(2).alignment = centerAlign;
      [10, 11, 13].forEach((c) => {
        totalRow.getCell(c).alignment = rightAlign;
      });

      if (g.id !== 5) sellTotalRows.push(sellRowIdx);
      sellRowIdx++;
    });

    // Grand total
    const grandRow = wsSell.getRow(sellRowIdx);
    grandRow.height = 24;
    grandRow.getCell(2).value = 'Tổng';
    if (sellTotalRows.length > 0) {
      grandRow.getCell(10).value = {
        formula: '=' + sellTotalRows.map((r) => `J${r}`).join('+'),
      };
      grandRow.getCell(11).value = {
        formula: '=' + sellTotalRows.map((r) => `K${r}`).join('+'),
      };
    } else {
      grandRow.getCell(10).value = 0;
      grandRow.getCell(11).value = 0;
    }
    grandRow.getCell(13).value = { formula: `=J${sellRowIdx}+K${sellRowIdx}` };
    grandRow.getCell(10).numFmt = '#,##0';
    grandRow.getCell(11).numFmt = '#,##0';
    grandRow.getCell(13).numFmt = '#,##0';

    this.styleRange(wsSell, sellRowIdx, 2, sellRowIdx, 13, {
      font: m7DataBoldFont,
      border: blackBorder,
    });
    grandRow.getCell(2).alignment = centerAlign;
    [10, 11, 13].forEach((c) => {
      grandRow.getCell(c).alignment = rightAlign;
    });

    const sellGrandRowIdx = sellRowIdx;
    sellRowIdx++;

    // TCT row
    const tctRowIdx = sellRowIdx;
    wsSell.getRow(tctRowIdx).height = 22;
    wsSell.getCell(`I${tctRowIdx}`).value = 'TCT';
    wsSell.getCell(`J${tctRowIdx}`).value = { formula: `=J${sellGrandRowIdx}` };
    wsSell.getCell(`K${tctRowIdx}`).value = { formula: `=K${sellGrandRowIdx}` };
    wsSell.getCell(`J${tctRowIdx}`).numFmt = '#,##0';
    wsSell.getCell(`K${tctRowIdx}`).numFmt = '#,##0';
    this.styleRange(wsSell, tctRowIdx, 2, tctRowIdx, 13, {
      font: m7DataBoldFont,
      border: blackBorder,
    });
    wsSell.getCell(`I${tctRowIdx}`).alignment = centerAlign;
    [10, 11].forEach((c) => {
      wsSell.getCell(`${String.fromCharCode(64 + c)}${tctRowIdx}`).alignment =
        rightAlign;
    });
    sellRowIdx++;

    // CL row
    const clRowIdx = sellRowIdx;
    wsSell.getRow(clRowIdx).height = 22;
    wsSell.mergeCells(`B${clRowIdx}:H${clRowIdx}`);
    wsSell.getCell(`B${clRowIdx}`).value =
      'Tổng doanh thu hàng hoá, dịch vụ bán ra chịu thuế GTGT (*):             ............................';
    wsSell.getCell(`I${clRowIdx}`).value = 'CL';
    wsSell.getCell(`J${clRowIdx}`).value = {
      formula: `=J${sellGrandRowIdx}-J${tctRowIdx}`,
    };
    wsSell.getCell(`K${clRowIdx}`).value = {
      formula: `=K${sellGrandRowIdx}-K${tctRowIdx}`,
    };
    wsSell.getCell(`J${clRowIdx}`).numFmt = '#,##0';
    wsSell.getCell(`K${clRowIdx}`).numFmt = '#,##0';
    this.styleRange(wsSell, clRowIdx, 2, clRowIdx, 13, {
      font: m7DataBoldFont,
      border: blackBorder,
    });
    wsSell.getCell(`B${clRowIdx}`).alignment = leftAlign;
    wsSell.getCell(`I${clRowIdx}`).alignment = centerAlign;
    [10, 11].forEach((c) => {
      wsSell.getCell(`${String.fromCharCode(64 + c)}${clRowIdx}`).alignment =
        rightAlign;
    });
    sellRowIdx++;

    // Text label row
    const labelRowIdx = sellRowIdx;
    wsSell.getRow(labelRowIdx).height = 22;
    wsSell.mergeCells(`B${labelRowIdx}:H${labelRowIdx}`);
    wsSell.getCell(`B${labelRowIdx}`).value =
      'Tổng số thuế GTGT của hàng hóa, dịch vụ bán ra (**):   ............................';
    for (let col = 2; col <= 8; col++) {
      wsSell.getCell(labelRowIdx, col).font = m7DataBoldFont;
    }
    sellRowIdx += 2;

    // Signature
    const sigRowIdx = sellRowIdx;
    const today = new Date();
    wsSell.getCell(`J${sigRowIdx}`).value =
      `TP. Hồ Chí Minh, ngày ${String(today.getDate()).padStart(2, '0')} tháng ${String(today.getMonth() + 1).padStart(2, '0')} năm ${today.getFullYear()}`;
    wsSell.getCell(`J${sigRowIdx}`).font = m7ItalicFont;
    wsSell.getCell(`J${sigRowIdx}`).alignment = centerAlign;
    sellRowIdx++;

    wsSell.getCell(`J${sellRowIdx}`).value = 'NGƯỜI NỘP THUẾ hoặc';
    wsSell.getCell(`J${sellRowIdx}`).font = m7DataBoldFont;
    wsSell.getCell(`J${sellRowIdx}`).alignment = centerAlign;
    sellRowIdx++;

    wsSell.getCell(`J${sellRowIdx}`).value =
      'ĐẠI DIỆN HỢP PHÁP CỦA NGƯỜI NỘP THUẾ';
    wsSell.getCell(`J${sellRowIdx}`).font = m7DataBoldFont;
    wsSell.getCell(`J${sellRowIdx}`).alignment = centerAlign;
    sellRowIdx++;

    wsSell.getCell(`J${sellRowIdx}`).value =
      ' Ký tên, đóng dấu (ghi rõ họ tên và chức vụ)';
    wsSell.getCell(`J${sellRowIdx}`).font = m7ItalicFont;
    wsSell.getCell(`J${sellRowIdx}`).alignment = centerAlign;

    return sigRowIdx;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Sheet: MUA VÀO
  // ═══════════════════════════════════════════════════════════════════════════

  private buildBuySheet(
    workbook: ExcelJS.Workbook,
    buyInvoices: (ParsedInvoice & { type: string })[],
    taxpayerName: string,
    taxpayerTaxCode: string,
    periodStr: string,
    sigRowIdx: number,
    m7TitleFont: any,
    m7SubtitleFont: any,
    m7HeaderFont: any,
    m7SectionFont: any,
    m7DataFont: any,
    m7DataBoldFont: any,
    m7ItalicFont: any,
    headerAlign: any,
    leftAlign: any,
    rightAlign: any,
    centerAlign: any,
    blackBorder: any,
  ): void {
    const wsBuy = workbook.addWorksheet('MUA VÀO', {
      views: [{ showGridLines: true }],
    });

    const buyColWidths = [
      8.38, 8.13, 9.13, 10.38, 11.13, 13.38, 38.88, 21.38, 35.75, 21.38, 12.0,
      24.13, 13.88, 22.38,
    ];
    buyColWidths.forEach((w, i) => (wsBuy.getColumn(i + 1).width = w));
    wsBuy.getRow(1).height = 15;

    wsBuy.mergeCells('B1:M1');
    wsBuy.getCell('B1').value =
      'BẢNG KÊ HOÁ ĐƠN, CHỨNG TỪ HÀNG HOÁ, DỊCH VỤ MUA VÀO';
    this.styleRange(wsBuy, 1, 2, 1, 13, {
      font: m7TitleFont,
      alignment: headerAlign,
    });
    wsBuy.getRow(1).height = 25;

    wsBuy.mergeCells('B2:M2');
    wsBuy.getCell('B2').value =
      '(Kèm theo tờ khai thuế GTGT theo mẫu số 01/GTGT)';
    this.styleRange(wsBuy, 2, 2, 2, 13, {
      font: m7SubtitleFont,
      alignment: headerAlign,
    });
    wsBuy.getRow(2).height = 20;

    wsBuy.mergeCells('B3:M3');
    wsBuy.getCell('B3').value = periodStr;
    this.styleRange(wsBuy, 3, 2, 3, 13, {
      font: m7DataFont,
      alignment: headerAlign,
    });
    wsBuy.getRow(3).height = 20;

    wsBuy.getRow(4).height = 15;

    wsBuy.mergeCells('B5:M5');
    wsBuy.getCell('B5').value = 'Người nộp thuế:  ' + taxpayerName;
    this.styleRange(wsBuy, 5, 2, 5, 13, {
      font: m7TitleFont,
      alignment: leftAlign,
    });
    wsBuy.getRow(5).height = 20;

    wsBuy.mergeCells('B6:M6');
    wsBuy.getCell('B6').value = 'Mã số thuế: ' + taxpayerTaxCode;
    this.styleRange(wsBuy, 6, 2, 6, 13, {
      font: m7TitleFont,
      alignment: leftAlign,
    });
    wsBuy.getRow(6).height = 20;

    wsBuy.mergeCells('B7:M7');
    wsBuy.getCell('B7').value = 'Đơn vị tiền: đồng Việt Nam';
    this.styleRange(wsBuy, 7, 2, 7, 13, {
      font: m7ItalicFont,
      alignment: leftAlign,
    });
    wsBuy.getRow(7).height = 20;

    // Headers
    wsBuy.mergeCells('B8:B10');
    wsBuy.getCell('B8').value = 'STT';
    this.styleRange(wsBuy, 8, 2, 10, 2, {
      font: m7HeaderFont,
      alignment: headerAlign,
      border: blackBorder,
    });

    wsBuy.mergeCells('C8:F9');
    this.styleRange(wsBuy, 8, 3, 9, 6, {
      font: m7HeaderFont,
      alignment: headerAlign,
      border: blackBorder,
    });
    wsBuy.getCell('C10').value = 'Ký hiệu mẫu hóa đơn';
    wsBuy.getCell('D10').value = 'Ký hiệu hoá đơn';
    wsBuy.getCell('E10').value = 'Số hoá đơn';
    wsBuy.getCell('F10').value = 'Ngày, tháng, năm lập hóa đơn';
    this.styleRange(wsBuy, 10, 3, 10, 6, {
      font: m7HeaderFont,
      alignment: headerAlign,
      border: blackBorder,
    });

    wsBuy.mergeCells('G8:G10');
    wsBuy.getCell('G8').value = 'Tên người bán';
    wsBuy.mergeCells('H8:H10');
    wsBuy.getCell('H8').value = 'Mã số thuế người bán';
    wsBuy.mergeCells('I8:I10');
    wsBuy.getCell('I8').value = 'Mặt hàng';
    wsBuy.mergeCells('J8:J10');
    wsBuy.getCell('J8').value = 'Doanh số mua chưa có thuế';
    wsBuy.mergeCells('K8:K10');
    wsBuy.getCell('K8').value = 'Thuế suất';
    wsBuy.mergeCells('L8:L10');
    wsBuy.getCell('L8').value = 'Thuế GTGT\nđủ điều kiện khấu trừ thuế';
    wsBuy.mergeCells('M8:M10');
    wsBuy.getCell('M8').value = 'GHI CHÚ';

    this.styleRange(wsBuy, 8, 7, 10, 13, {
      font: m7HeaderFont,
      alignment: headerAlign,
      border: blackBorder,
    });
    wsBuy.getRow(8).height = 15;
    wsBuy.getRow(9).height = 15;
    wsBuy.getRow(10).height = 25;

    // Index row
    const row11Buy = wsBuy.getRow(11);
    row11Buy.height = 20;
    const indicesBuy = [
      '[1]',
      '[2]',
      '[3]',
      '',
      '',
      '[4]',
      '[5]',
      '[6]',
      '[7]',
      '[8]',
      '[9]',
      '[10]',
    ];
    indicesBuy.forEach((val, idx) => {
      row11Buy.getCell(idx + 2).value = val;
    });
    this.styleRange(wsBuy, 11, 2, 11, 13, {
      font: m7DataFont,
      alignment: centerAlign,
      border: blackBorder,
    });

    let buyRowIdx = 12;

    // Section 1
    wsBuy.mergeCells(`B${buyRowIdx}:M${buyRowIdx}`);
    wsBuy.getCell(`B${buyRowIdx}`).value =
      '1. Hàng hoá, dịch vụ dùng riêng cho SXKD chịu thuế GTGT và sử dụng cho các hoạt động cung cấp hàng hoá, dịch vụ không kê khai, nộp thuế GTGT đủ điều kiện khấu trừ thuế: ';
    this.styleRange(wsBuy, buyRowIdx, 2, buyRowIdx, 13, {
      font: m7SectionFont,
      alignment: leftAlign,
      border: blackBorder,
    });
    wsBuy.getRow(buyRowIdx).height = 22;
    buyRowIdx++;

    const s1Start = buyRowIdx;

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
      row.getCell(9).value = inv.items.map((item) => item.name).join(', ');

      row.getCell(10).value = inv.totalBeforeTax;
      row.getCell(10).numFmt = '#,##0';

      let rateVal: any = inv.items[0]?.taxRate;
      let isPct = false;
      if (rateVal) {
        const match = rateVal.match(/(\d+)%/);
        if (match) {
          const pct = parseFloat(match[1]);
          if (!isNaN(pct)) {
            rateVal = pct / 100;
            isPct = true;
          }
        } else if (!isNaN(parseFloat(rateVal))) {
          rateVal = parseFloat(rateVal) / 100;
          isPct = true;
        }
      }
      row.getCell(11).value = rateVal;
      if (isPct) row.getCell(11).numFmt = '0%';

      row.getCell(12).value = inv.taxAmount;
      row.getCell(12).numFmt = '#,##0';

      row.getCell(13).value = {
        formula: `=IF(N${buyRowIdx}>=5000000,"CK","TM")`,
      };
      row.getCell(14).value = {
        formula: `=J${buyRowIdx}+L${buyRowIdx}`,
      };
      row.getCell(14).numFmt = '#,##0';

      this.styleRange(wsBuy, buyRowIdx, 2, buyRowIdx, 14, {
        font: m7DataFont,
        border: blackBorder,
      });
      [2, 3, 4, 5, 6, 8, 11, 13].forEach((c) => {
        row.getCell(c).alignment = centerAlign;
      });
      [7, 9].forEach((c) => {
        row.getCell(c).alignment = leftAlign;
      });
      [10, 12, 14].forEach((c) => {
        row.getCell(c).alignment = rightAlign;
      });

      buyRowIdx++;
    });

    const s1End = buyRowIdx - 1;

    // Section 1 total
    const s1TotalRowIdx = buyRowIdx;
    wsBuy.getRow(s1TotalRowIdx).height = 24;
    wsBuy.getCell(`B${s1TotalRowIdx}`).value = 'Tổng';
    if (buyInvoices.length > 0) {
      wsBuy.getCell(`J${s1TotalRowIdx}`).value = {
        formula: `=SUM(J${s1Start}:J${s1End})`,
      };
      wsBuy.getCell(`L${s1TotalRowIdx}`).value = {
        formula: `=SUM(L${s1Start}:L${s1End})`,
      };
      wsBuy.getCell(`N${s1TotalRowIdx}`).value = {
        formula: `=SUM(N${s1Start}:N${s1End})`,
      };
    } else {
      [10, 12, 14].forEach((c) => {
        wsBuy.getCell(s1TotalRowIdx, c).value = 0;
      });
    }
    [10, 12, 14].forEach((c) => {
      wsBuy.getCell(s1TotalRowIdx, c).numFmt = '#,##0';
    });

    this.styleRange(wsBuy, s1TotalRowIdx, 2, s1TotalRowIdx, 14, {
      font: m7DataBoldFont,
      border: blackBorder,
    });
    wsBuy.getCell(`B${s1TotalRowIdx}`).alignment = centerAlign;
    [10, 12, 14].forEach((c) => {
      wsBuy.getCell(s1TotalRowIdx, c).alignment = rightAlign;
    });
    buyRowIdx++;

    // Section 3 (empty)
    wsBuy.mergeCells(`B${buyRowIdx}:M${buyRowIdx}`);
    wsBuy.getCell(`B${buyRowIdx}`).value =
      '3. Hàng hóa, dịch vụ dùng cho dự án đầu tư đủ điều kiện được khấu trừ thuế (*):';
    this.styleRange(wsBuy, buyRowIdx, 2, buyRowIdx, 13, {
      font: m7SectionFont,
      alignment: leftAlign,
      border: blackBorder,
    });
    wsBuy.getRow(buyRowIdx).height = 22;
    buyRowIdx++;

    const s3TotalRowIdx = buyRowIdx;
    wsBuy.getRow(s3TotalRowIdx).height = 24;
    wsBuy.getCell(`B${s3TotalRowIdx}`).value = 'Tổng';
    [10, 12, 14].forEach((c) => {
      wsBuy.getCell(s3TotalRowIdx, c).value = 0;
      wsBuy.getCell(s3TotalRowIdx, c).numFmt = '#,##0';
    });
    this.styleRange(wsBuy, s3TotalRowIdx, 2, s3TotalRowIdx, 14, {
      font: m7DataBoldFont,
      border: blackBorder,
    });
    wsBuy.getCell(`B${s3TotalRowIdx}`).alignment = centerAlign;
    [10, 12, 14].forEach((c) => {
      wsBuy.getCell(s3TotalRowIdx, c).alignment = rightAlign;
    });
    buyRowIdx++;

    // Section 5
    wsBuy.mergeCells(`B${buyRowIdx}:M${buyRowIdx}`);
    wsBuy.getCell(`B${buyRowIdx}`).value =
      '5. Hàng hóa, dịch vụ không phải tổng hợp trên tờ khai 01/GTGT:';
    this.styleRange(wsBuy, buyRowIdx, 2, buyRowIdx, 13, {
      font: m7SectionFont,
      alignment: leftAlign,
      border: blackBorder,
    });
    wsBuy.getRow(buyRowIdx).height = 22;
    buyRowIdx++;

    // Grand total
    const grandRowBuyIdx = buyRowIdx;
    wsBuy.getRow(grandRowBuyIdx).height = 24;
    wsBuy.getCell(`B${grandRowBuyIdx}`).value = 'Tổng';
    wsBuy.getCell(`J${grandRowBuyIdx}`).value = {
      formula: `=J${s1TotalRowIdx}+J${s3TotalRowIdx}`,
    };
    wsBuy.getCell(`L${grandRowBuyIdx}`).value = {
      formula: `=L${s1TotalRowIdx}+L${s3TotalRowIdx}`,
    };
    wsBuy.getCell(`N${grandRowBuyIdx}`).value = {
      formula: `=J${grandRowBuyIdx}+L${grandRowBuyIdx}`,
    };
    [10, 12, 14].forEach((c) => {
      wsBuy.getCell(grandRowBuyIdx, c).numFmt = '#,##0';
    });

    this.styleRange(wsBuy, grandRowBuyIdx, 2, grandRowBuyIdx, 14, {
      font: m7DataBoldFont,
      border: blackBorder,
    });
    wsBuy.getCell(`B${grandRowBuyIdx}`).alignment = centerAlign;
    [10, 12, 14].forEach((c) => {
      wsBuy.getCell(grandRowBuyIdx, c).alignment = rightAlign;
    });
    buyRowIdx++;

    // Signature labels
    const buyLabel1Idx = buyRowIdx;
    wsBuy.getRow(buyLabel1Idx).height = 22;
    wsBuy.mergeCells(`B${buyLabel1Idx}:H${buyLabel1Idx}`);
    wsBuy.getCell(`B${buyLabel1Idx}`).value =
      'Tổng giá trị HHDV mua vào phục vụ SXKD được khấu trừ thuế GTGT (**):              ............................';
    for (let col = 2; col <= 8; col++) {
      wsBuy.getCell(buyLabel1Idx, col).font = m7DataBoldFont;
    }
    buyRowIdx++;

    const buyLabel2Idx = buyRowIdx;
    wsBuy.getRow(buyLabel2Idx).height = 22;
    wsBuy.mergeCells(`B${buyLabel2Idx}:H${buyLabel2Idx}`);
    wsBuy.getCell(`B${buyLabel2Idx}`).value =
      'Tổng số thuế GTGT của HHDV mua vào đủ điều kiện được khấu trừ (***):          ............................';
    for (let col = 2; col <= 8; col++) {
      wsBuy.getCell(buyLabel2Idx, col).font = m7DataBoldFont;
    }
    buyRowIdx += 2;

    // Signatures
    const sigBuyRowIdx = buyRowIdx;
    wsBuy.getRow(sigBuyRowIdx).height = 22;
    wsBuy.getCell(`J${sigBuyRowIdx}`).value = {
      formula: `='BÁN RA'!J${sigRowIdx}`,
    };
    wsBuy.getCell(`J${sigBuyRowIdx}`).font = m7ItalicFont;
    wsBuy.getCell(`J${sigBuyRowIdx}`).alignment = centerAlign;
    buyRowIdx++;

    wsBuy.getCell(`J${buyRowIdx}`).value = 'NGƯỜI NỘP THUẾ hoặc';
    wsBuy.getCell(`J${buyRowIdx}`).font = m7DataBoldFont;
    wsBuy.getCell(`J${buyRowIdx}`).alignment = centerAlign;
    buyRowIdx++;

    wsBuy.getCell(`J${buyRowIdx}`).value =
      'ĐẠI DIỆN HỢP PHÁP CỦA NGƯỜI NỘP THUẾ';
    wsBuy.getCell(`J${buyRowIdx}`).font = m7DataBoldFont;
    wsBuy.getCell(`J${buyRowIdx}`).alignment = centerAlign;
    buyRowIdx++;

    wsBuy.getCell(`J${buyRowIdx}`).value =
      ' Ký tên, đóng dấu (ghi rõ họ tên và chức vụ)';
    wsBuy.getCell(`J${buyRowIdx}`).font = m7ItalicFont;
    wsBuy.getCell(`J${buyRowIdx}`).alignment = centerAlign;
  }
}
