import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import axios from 'axios';

export interface MaSoThueResult {
  name: string;
  taxCode: string;
  taxAddress: string;
  address: string;
  status: string;
  representative: string;
  representativeExtra: string;
  phone: string;
  activeDate: string;
  managedBy: string;
  type: string;
}

@Injectable()
export class MaSoThueService {
  private readonly logger = new Logger(MaSoThueService.name);

  private readonly axiosConfig = {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Tạo slug từ tên công ty để dùng trong URL
   */
  private slugify(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Parse HTML trang chi tiết công ty trên masothue.com
   */
  private parseCompanyHTML(html: string, codeToSearch: string): MaSoThueResult {
    const $ = cheerio.load(html);

    const name =
      $('table.table-taxinfo thead th span.copy').text().trim() ||
      $('table.table-taxinfo thead th').text().trim();

    const code = $('td[itemprop="taxID"] span.copy').text().trim();

    const taxAddress = $('td i.fa-map-marker')
      .parent()
      .filter((_i, el) => $(el).text().trim() === 'Địa chỉ Thuế')
      .next()
      .text()
      .trim();

    let address = $('td i.fa-map-marker')
      .parent()
      .filter((_i, el) => $(el).text().trim() === 'Địa chỉ')
      .next()
      .text()
      .trim();
    if (!address) {
      address = taxAddress;
    }

    const status = $('td i.fa-info').parent().next().text().trim();

    const repCell = $('td i.fa-user').parent().next();
    const repName = repCell.find('span[itemprop="name"]').text().trim();
    const repExtra = repCell.find('em').text().trim();

    let phone = $('#tel-full').text().trim();
    if (!phone) {
      phone =
        $('td i.fa-phone')
          .parent()
          .next()
          .find('span[itemprop="telephone"]')
          .text()
          .trim() ||
        $('td i.fa-phone').parent().next().text().trim();
    }

    const activeDate = $('td i.fa-calendar')
      .parent()
      .filter((_i, el) => $(el).text().trim() === 'Ngày hoạt động')
      .next()
      .text()
      .trim();

    const managedBy = $('td i.fa-users').parent().next().text().trim();

    const type = $('td i.fa-building')
      .parent()
      .filter((_i, el) => {
        const text = $(el).text().trim();
        return text === 'Loại hình pháp lý' || text === 'Loại hình DN';
      })
      .next()
      .text()
      .trim();

    return {
      name: name || 'Không xác định',
      taxCode: code || codeToSearch,
      taxAddress: taxAddress || 'Đang cập nhật',
      address: address || 'Đang cập nhật',
      status: status || 'Đang cập nhật',
      representative: repName || 'Đang cập nhật',
      representativeExtra: repExtra || '',
      phone: phone || 'Đang cập nhật',
      activeDate: activeDate || 'Đang cập nhật',
      managedBy: managedBy || 'Đang cập nhật',
      type: type || 'Đang cập nhật',
    };
  }

  // ─── Lookup từ masothue.com ────────────────────────────────────────────────

  private async lookupFromMaSoThue(
    codeToSearch: string,
  ): Promise<MaSoThueResult> {
    this.logger.log(`Fetching search page for MST: ${codeToSearch}`);

    const searchUrl = `https://masothue.com/Search/?q=${codeToSearch}&type=enterpriseTax`;
    const response = await axios.get(searchUrl, this.axiosConfig);
    const $ = cheerio.load(response.data);

    let htmlToParse = '';
    const hasTaxInfoTable = $('table.table-taxinfo').length > 0;

    if (hasTaxInfoTable) {
      // Trang kết quả trực tiếp là trang chi tiết
      const taxIDFromPage = $('td[itemprop="taxID"] span.copy').text().trim();
      if (!taxIDFromPage || !taxIDFromPage.startsWith(codeToSearch)) {
        throw new Error('Không tìm thấy doanh nghiệp trên masothue.com');
      }
      htmlToParse = response.data;
    } else {
      // Trang danh sách — tìm link chính xác theo MST
      let companyUrl = '';
      $('.tax-listing .fa-hashtag').each((_i, el) => {
        const parentDiv = $(el).parent();
        const link = parentDiv.find('a').first();
        if (link.text().trim() === codeToSearch) {
          companyUrl = 'https://masothue.com' + link.attr('href');
        }
      });

      if (!companyUrl) {
        throw new Error('Không tìm thấy doanh nghiệp trên masothue.com');
      }

      this.logger.log(`Found exact match URL: ${companyUrl}`);
      const companyRes = await axios.get(companyUrl, this.axiosConfig);
      htmlToParse = companyRes.data;
    }

    return this.parseCompanyHTML(htmlToParse, codeToSearch);
  }

  // ─── Fallback VietQR API ─────────────────────────────────────────────────

  private async lookupFromVietQR(
    codeToSearch: string,
  ): Promise<MaSoThueResult> {
    this.logger.log(`Attempting VietQR fallback for: ${codeToSearch}`);

    const vietQrRes = await axios.get(
      `https://api.vietqr.io/v2/business/${codeToSearch}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      },
    );

    if (
      !vietQrRes.data ||
      vietQrRes.data.code !== '00' ||
      !vietQrRes.data.data
    ) {
      throw new Error('VietQR returned empty data');
    }

    const data = vietQrRes.data.data;

    // Thử đoán URL masothue.com từ tên công ty để lấy dữ liệu phong phú hơn
    try {
      const slug = this.slugify(data.name);
      const guessedUrl = `https://masothue.com/${codeToSearch}-${slug}`;
      this.logger.log(`Trying guessed URL: ${guessedUrl}`);

      const response = await axios.get(guessedUrl, this.axiosConfig);
      if (response.status === 200) {
        this.logger.log(`Guessed URL successful — parsing rich data`);
        return this.parseCompanyHTML(response.data, codeToSearch);
      }
    } catch {
      this.logger.warn(
        `Failed to fetch guessed URL — returning basic VietQR data`,
      );
    }

    return {
      name: data.name || 'Không xác định',
      taxCode: data.id || codeToSearch,
      taxAddress: data.address || 'Đang cập nhật',
      address: data.address || 'Đang cập nhật',
      status: data.status || 'Đang cập nhật',
      representative: 'Đang cập nhật',
      representativeExtra: '',
      phone: 'Đang cập nhật',
      activeDate: 'Đang cập nhật',
      managedBy: 'Đang cập nhật',
      type: 'Đang cập nhật',
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Tra cứu thông tin doanh nghiệp theo mã số thuế.
   * Sử dụng masothue.com làm nguồn chính, fallback sang VietQR API.
   */
  async lookup(taxCode: string): Promise<MaSoThueResult> {
    const codeToSearch = taxCode.trim();

    try {
      return await this.lookupFromMaSoThue(codeToSearch);
    } catch (error: any) {
      this.logger.warn(
        `masothue.com failed: ${error.message}. Falling back to VietQR...`,
      );

      try {
        return await this.lookupFromVietQR(codeToSearch);
      } catch (fallbackErr: any) {
        this.logger.error(
          `All lookup sources failed for MST ${codeToSearch}`,
        );
        throw new Error(
          'Không tìm thấy doanh nghiệp với mã số thuế này trên cả MaSoThue và VietQR.',
        );
      }
    }
  }
}
