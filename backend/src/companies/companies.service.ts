import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaptchaResolverService } from '../ai/captcha-resolver.service';
import { ConfigService } from '@nestjs/config';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompaniesDto } from './dto/query-companies.dto';
import { ManualLoginDto } from './dto/manual-login.dto';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import axios from 'axios';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  private readonly gdtBaseUrl = 'https://hoadondientu.gdt.gov.vn/api';
  private readonly headers = {
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0',
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://hoadondientu.gdt.gov.vn/',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly captchaResolver: CaptchaResolverService,
    private readonly config: ConfigService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Gọi GDT API để đăng nhập và lấy token
   */
  private async gdtAuthenticate(
    username: string,
    password: string,
    ckey: string,
    cvalue: string,
  ): Promise<string> {
    const loginUrl = `${this.gdtBaseUrl}/security-taxpayer/authenticate`;

    try {
      const response = await axios.post(
        loginUrl,
        { username, password, cvalue, ckey },
        { headers: this.headers, timeout: 20000 },
      );
      if (response.data?.token) {
        return response.data.token;
      }
      throw new Error('GDT authentication did not return a session token');
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message;
      throw new BadRequestException(`GDT login failed: ${errorMsg}`);
    }
  }

  /**
   * Giải mã thời gian hết hạn từ JWT token của GDT
   */
  private getTokenExpiration(token: string): Date | null {
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const buffer = Buffer.from(parts[1], 'base64');
        const payload = JSON.parse(buffer.toString('utf-8'));
        if (payload?.exp) {
          return new Date(payload.exp * 1000);
        }
      }
    } catch {
      this.logger.warn('Failed to decode GDT token expiration');
    }
    return null;
  }

  /**
   * Lấy tên doanh nghiệp từ GDT profile
   */
  private async getTaxpayerName(token: string): Promise<string> {
    const profileUrl = `${this.gdtBaseUrl}/security-taxpayer/profile`;
    try {
      const response = await axios.get(profileUrl, {
        headers: {
          ...this.headers,
          Authorization: `Bearer ${token}`,
        },
        timeout: 15000,
      });
      return response.data?.name || '';
    } catch {
      this.logger.warn('Failed to fetch taxpayer profile name');
      return '';
    }
  }

  /**
   * Thực hiện đăng nhập GDT với retry (cho AUTO mode)
   */
  private async loginAuto(
    taxCode: string,
    lookupPassword: string,
    maxRetries: number = 3,
  ): Promise<string> {
    const geminiApiKey = this.config.get<string>('GEMINI_API_KEY');

    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      this.logger.log(`Login attempt ${attempt}/${maxRetries} for ${taxCode}`);

      try {
        const { ckey, cvalue } =
          await this.captchaResolver.resolve(geminiApiKey);

        if (!cvalue || cvalue.length !== 6) {
          this.logger.warn(
            `Invalid captcha length (${cvalue?.length}), retrying...`,
          );
          continue;
        }

        return await this.gdtAuthenticate(
          taxCode,
          lookupPassword,
          ckey,
          cvalue,
        );
      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';

        // Fail fast if credentials are wrong
        const isCredentialError =
          errorMsg.includes('tài khoản') ||
          errorMsg.includes('mật khẩu') ||
          errorMsg.includes('không đúng') ||
          errorMsg.includes('không tồn tại');

        if (isCredentialError) {
          throw error;
        }

        if (attempt >= maxRetries) {
          throw new BadRequestException(
            `Failed to authenticate with GDT after ${maxRetries} attempts: ${error.message}`,
          );
        }
      }
    }

    throw new BadRequestException('Authentication failed');
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async findAll(query: QueryCompaniesDto): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 10,
      search,
      loginMode,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      ...(search && {
        OR: [
          { taxCode: { contains: search } },
          { name: { contains: search } },
        ],
      }),
      ...(loginMode && { loginMode }),
    };

    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.company.count({ where }),
    ]);

    return paginate(companies, total, page, limit);
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }

  async create(dto: CreateCompanyDto, userId: string) {
    // Check duplicate
    const existing = await this.prisma.company.findUnique({
      where: { taxCode: dto.taxCode },
    });
    if (existing) {
      throw new ConflictException(
        `Company with tax code ${dto.taxCode} already exists`,
      );
    }

    const loginMode = dto.loginMode || 'AUTO';

    let token: string;
    if (loginMode === 'AUTO') {
      token = await this.loginAuto(dto.taxCode, dto.lookupPassword);
    } else {
      if (!dto.ckey || !dto.cvalue) {
        throw new BadRequestException(
          'Captcha key and value are required for manual login mode',
        );
      }
      token = await this.gdtAuthenticate(
        dto.taxCode,
        dto.lookupPassword,
        dto.ckey,
        dto.cvalue,
      );
    }

    const tokenExpiredAt = this.getTokenExpiration(token);
    const resolvedName =
      dto.name || (await this.getTaxpayerName(token)) || dto.taxCode;

    return this.prisma.company.create({
      data: {
        taxCode: dto.taxCode,
        name: resolvedName,
        lookupPassword: dto.lookupPassword,
        loginMode,
        token,
        tokenExpiredAt,
        createdBy: userId,
      },
    });
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.findOne(id); // ensure exists, throws NotFoundException if not

    return this.prisma.company.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    await this.findOne(id);

    await this.prisma.company.delete({ where: { id } });
    return { message: 'Company deleted successfully' };
  }

  // ─── Token & Login ────────────────────────────────────────────────────────

  async refreshToken(id: string) {
    const company = await this.findOne(id);

    if (company.loginMode !== 'AUTO') {
      throw new BadRequestException(
        'Only AUTO mode companies can refresh token automatically',
      );
    }

    const token = await this.loginAuto(company.taxCode, company.lookupPassword);
    const tokenExpiredAt = this.getTokenExpiration(token);
    const resolvedName =
      (await this.getTaxpayerName(token)) || company.name;

    return this.prisma.company.update({
      where: { id },
      data: { token, tokenExpiredAt, name: resolvedName },
    });
  }

  async loginManual(id: string, dto: ManualLoginDto) {
    const company = await this.findOne(id);

    const token = await this.gdtAuthenticate(
      company.taxCode,
      company.lookupPassword,
      dto.ckey,
      dto.cvalue,
    );
    const tokenExpiredAt = this.getTokenExpiration(token);
    const resolvedName =
      (await this.getTaxpayerName(token)) || company.name;

    return this.prisma.company.update({
      where: { id },
      data: { token, tokenExpiredAt, name: resolvedName },
    });
  }

  // ─── Sync Info ────────────────────────────────────────────────────────────

  async syncCompanyInfo(id: string) {
    const company = await this.findOne(id);

    // Try to fetch info from masothue.com
    try {
      const info = await this.fetchMaSoThueInfo(company.taxCode);

      return this.prisma.company.update({
        where: { id },
        data: {
          name: info.name || company.name,
          address: info.address,
          taxAddress: info.taxAddress,
          representative: info.representative,
          phone: info.phone,
          activeDate: info.activeDate,
          managedBy: info.managedBy,
          companyType: info.type,
          status: info.status,
          lastSyncedAt: new Date(),
        },
      });
    } catch (error: any) {
      throw new BadRequestException(
        `Failed to sync company info: ${error.message}`,
      );
    }
  }

  /**
   * Tra cứu thông tin doanh nghiệp từ masothue.com
   * (copy logic từ source code cũ)
   */
  private async fetchMaSoThueInfo(taxCode: string): Promise<{
    name?: string;
    address?: string;
    taxAddress?: string;
    representative?: string;
    phone?: string;
    activeDate?: string;
    managedBy?: string;
    type?: string;
    status?: string;
  }> {
    const url = `https://masothue.com/Search/?q=${taxCode}&type=auto`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0',
          Accept: 'text/html,application/xhtml+xml',
        },
        timeout: 15000,
      });

      const html: string = response.data;
      const result: any = {};

      // Parse the HTML to extract company info
      // Các pattern tìm kiếm dựa trên cấu trúc HTML của masothue.com
      const extract = (pattern: RegExp, html: string): string | undefined => {
        const match = html.match(pattern);
        return match ? match[1].trim() : undefined;
      };

      result.name = extract(
        /<h1[^>]*class="[^"]*h1[^"]*"[^>]*>([^<]+)<\/h1>/i,
        html,
      );
      result.address = extract(
        /<td[^>]*>\s*Địa chỉ trụ sở chính\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
        html,
      );
      result.taxAddress = extract(
        /<td[^>]*>\s*Địa chỉ thuế\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
        html,
      );
      result.representative = extract(
        /<td[^>]*>\s*Người đại diện pháp luật\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
        html,
      );
      result.phone = extract(
        /<td[^>]*>\s*Số điện thoại\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
        html,
      );
      result.activeDate = extract(
        /<td[^>]*>\s*Ngày hoạt động\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
        html,
      );
      result.managedBy = extract(
        /<td[^>]*>\s*Quản lý bởi\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
        html,
      );
      result.type = extract(
        /<td[^>]*>\s*Loại hình pháp lý\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
        html,
      );
      result.status = extract(
        /<td[^>]*>\s*Tình trạng\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
        html,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `Error fetching MaSoThue info for ${taxCode}: ${error.message}`,
      );
      throw error;
    }
  }
}
