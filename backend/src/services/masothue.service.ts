import * as cheerio from 'cheerio';
import axios from 'axios';

export class MaSoThueService {
  /**
   * Generates a URL-friendly slug from a company name
   */
  static slugify(str: string) {
    return str.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Parse company HTML into a structured JSON object
   */
  static parseCompanyHTML(html: string, codeToSearch: string) {
    const $ = cheerio.load(html);
    const name = $('table.table-taxinfo thead th span.copy').text().trim() || $('table.table-taxinfo thead th').text().trim();
    const code = $('td[itemprop="taxID"] span.copy').text().trim();
    const taxAddress = $('td i.fa-map-marker').parent().filter((i, el) => $(el).text().trim() === 'Địa chỉ Thuế').next().text().trim();
    
    let address = $('td i.fa-map-marker').parent().filter((i, el) => $(el).text().trim() === 'Địa chỉ').next().text().trim();
    if (!address) {
      address = taxAddress;
    }

    const status = $('td i.fa-info').parent().next().text().trim();
    const repCell = $('td i.fa-user').parent().next();
    const repName = repCell.find('span[itemprop="name"]').text().trim();
    const repExtra = repCell.find('em').text().trim();
    let phone = $('#tel-full').text().trim();
    if (!phone) {
      phone = $('td i.fa-phone').parent().next().find('span[itemprop="telephone"]').text().trim() || $('td i.fa-phone').parent().next().text().trim();
    }
    const activeDate = $('td i.fa-calendar').parent().filter((i, el) => $(el).text().trim() === 'Ngày hoạt động').next().text().trim();
    const managedBy = $('td i.fa-users').parent().next().text().trim();
    const type = $('td i.fa-building').parent().filter((i, el) => {
      const text = $(el).text().trim();
      return text === 'Loại hình pháp lý' || text === 'Loại hình DN';
    }).next().text().trim();

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
      type: type || 'Đang cập nhật'
    };
  }

  /**
   * Look up company tax code on masothue.com
   * @param taxCode Tax code string to search
   * @returns Object with company details
   */
  static async lookup(taxCode: string) {
    const codeToSearch = taxCode.trim();
    const axiosConfig = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    };

    try {
      console.log(`[MaSoThueService] Fetching search page for MST: ${codeToSearch}`);
      const searchUrl = `https://masothue.com/Search/?q=${codeToSearch}&type=enterpriseTax`;
      
      const response = await axios.get(searchUrl, axiosConfig);
      let $ = cheerio.load(response.data);

      let htmlToParse = '';
      
      const hasTaxInfoTable = $('table.table-taxinfo').length > 0;
      
      if (hasTaxInfoTable) {
        const taxIDFromPage = $('td[itemprop="taxID"] span.copy').text().trim();
        if (!taxIDFromPage || !taxIDFromPage.startsWith(codeToSearch)) {
           throw new Error('Không tìm thấy doanh nghiệp trên masothue.com');
        }
        htmlToParse = response.data;
      } else {
        let companyUrl = '';
        $('.tax-listing .fa-hashtag').each((i, el) => {
          const parentDiv = $(el).parent();
          const link = parentDiv.find('a').first();
          if (link.text().trim() === codeToSearch) {
            companyUrl = 'https://masothue.com' + link.attr('href');
          }
        });

        if (!companyUrl) {
          throw new Error('Không tìm thấy doanh nghiệp trên masothue.com');
        }

        console.log(`[MaSoThueService] Found exact match URL: ${companyUrl}`);
        const companyRes = await axios.get(companyUrl, axiosConfig);
        htmlToParse = companyRes.data;
      }

      return this.parseCompanyHTML(htmlToParse, codeToSearch);

    } catch (error: any) {
      console.log(`[MaSoThueService] masothue.com failed: ${error.message}. Attempting fallback to VietQR API...`);
      
      // Fallback to VietQR API
      try {
        const vietQrRes = await axios.get(`https://api.vietqr.io/v2/business/${codeToSearch}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        if (vietQrRes.data && vietQrRes.data.code === '00' && vietQrRes.data.data) {
          const data = vietQrRes.data.data;
          console.log(`[MaSoThueService] Found data via VietQR fallback. Attempting to guess masothue.com slug...`);
          
          try {
            const slug = this.slugify(data.name);
            const guessedUrl = `https://masothue.com/${codeToSearch}-${slug}`;
            console.log(`[MaSoThueService] Trying guessed URL: ${guessedUrl}`);
            const fallbackCompanyRes = await axios.get(guessedUrl, axiosConfig);
            if (fallbackCompanyRes.status === 200) {
              console.log(`[MaSoThueService] Guessed URL was successful. Parsing rich data.`);
              return this.parseCompanyHTML(fallbackCompanyRes.data, codeToSearch);
            }
          } catch (guessErr) {
            console.log(`[MaSoThueService] Failed to fetch guessed URL. Returning basic VietQR data instead.`);
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
            type: 'Đang cập nhật'
          };
        } else {
          throw new Error('VietQR returned empty data');
        }
      } catch (fallbackErr: any) {
        console.error('[MaSoThueService] Lỗi tra cứu MST trên cả 2 nguồn.');
        throw new Error('Không tìm thấy doanh nghiệp với mã số thuế này trên cả MaSoThue và VietQR.');
      }
    }
  }
}
