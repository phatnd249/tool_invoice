import ExcelJS from 'exceljs';

/**
 * Base service cung cấp shared styling helpers cho tất cả Excel report.
 * Các report service kế thừa class này để dùng chung fonts, fills, borders.
 */
export abstract class ExcelBaseService {
  // ── Colors ───────────────────────────────────────────────────────────────

  protected readonly primaryColor = 'FF1F4E78';

  // ── Fonts ────────────────────────────────────────────────────────────────

  protected readonly headerFont = {
    name: 'Segoe UI',
    size: 10,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };

  protected readonly titleFont = {
    name: 'Segoe UI',
    size: 16,
    bold: true,
    color: { argb: 'FF1F4E78' },
  };

  protected readonly dataFont = { name: 'Segoe UI', size: 10 };

  protected readonly totalFont = {
    name: 'Segoe UI',
    size: 10,
    bold: true,
    color: { argb: 'FF1F4E78' },
  };

  protected readonly italicFont = { name: 'Segoe UI', size: 9, italic: true };

  protected readonly linkFont = {
    name: 'Segoe UI',
    size: 10,
    color: { argb: 'FF0563C1' },
    underline: 'single' as const,
  };

  // ── Fills ────────────────────────────────────────────────────────────────

  protected get headerFill(): ExcelJS.Fill {
    return {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: this.primaryColor },
    };
  }

  protected get zebraFill(): ExcelJS.Fill {
    return {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF9FBFD' },
    };
  }

  protected get totalFill(): ExcelJS.Fill {
    return {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEAF2F8' },
    };
  }

  // ── Borders ──────────────────────────────────────────────────────────────

  protected get thinBorder(): any {
    return {
      top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    };
  }

  protected get totalBorder(): any {
    return {
      top: { style: 'thin', color: { argb: 'FF1F4E78' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'double', color: { argb: 'FF1F4E78' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  protected cleanSheetName(
    lookupCode: string | undefined,
    invoiceNumber: string,
  ): string {
    const base = lookupCode || `HD_${invoiceNumber}`;
    const clean = base.replace(/[\\/*?:[\]]/g, '');
    return clean.slice(0, 31);
  }

  protected formatInvoiceNumber(shdon: string): string {
    const num = parseInt(shdon, 10);
    return isNaN(num) ? shdon : String(num).padStart(8, '0');
  }

  protected formatDate(date: Date): string {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  protected styleRange(
    ws: ExcelJS.Worksheet,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    style: {
      font?: any;
      alignment?: any;
      border?: any;
      numFmt?: string;
    },
  ) {
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cell = ws.getCell(r, c);
        if (style.font) cell.font = style.font;
        if (style.alignment) cell.alignment = style.alignment;
        if (style.border) cell.border = style.border;
        if (style.numFmt) cell.numFmt = style.numFmt;
      }
    }
  }
}
