import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GdtAuthService } from '../ai/gdt-auth.service';
import { CaptchaResolverService } from '../ai/captcha-resolver.service';
import { MaSoThueService } from './masothue.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompaniesDto } from './dto/query-companies.dto';
import { ManualLoginDto } from './dto/manual-login.dto';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gdtAuth: GdtAuthService,
    private readonly captchaResolver: CaptchaResolverService,
    private readonly maSoThueService: MaSoThueService,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  /**
   * Loại bỏ các trường nhạy cảm (password, token) khỏi đối tượng company
   * trước khi trả về cho client.
   *
   * Vẫn trả về `hasToken` (boolean) và `tokenExpiredAt` (ngày hết hạn — không
   * nhạy cảm) để frontend hiển thị đúng trạng thái đăng nhập mà không lộ token.
   */
  private sanitizeCompany<T extends { lookupPassword?: any; token?: any; tokenExpiredAt?: any }>(
    company: T,
  ): Omit<T, 'lookupPassword' | 'token' | 'tokenExpiredAt'> & {
    tokenExpiredAt: any;
    hasToken: boolean;
  } {
    const { lookupPassword, token, tokenExpiredAt, ...safe } = company;
    return {
      ...safe,
      tokenExpiredAt: tokenExpiredAt ?? null,
      hasToken: !!token,
    };
  }

  async findAll(query: QueryCompaniesDto, userId?: string): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 10,
      search,
      loginMode,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    // Check if user has global scope (SUPER_ADMIN or company:scope permission)
    let hasGlobalScope = false;
    if (userId) {
      hasGlobalScope = await this.hasCompanyScope(userId);
    }

    const where: any = {
      ...(search && {
        OR: [
          { taxCode: { contains: search } },
          { name: { contains: search } },
        ],
      }),
      ...(loginMode && { loginMode }),
      // If user has no global scope, restrict to assigned companies only
      ...(userId && !hasGlobalScope && {
        userCompanies: {
          some: { userId },
        },
      }),
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

    return paginate(companies.map((c) => this.sanitizeCompany(c)), total, page, limit);
  }

  private async hasCompanyScope(userId: string): Promise<boolean> {
    const isSuperAdmin = await this.prisma.role.findFirst({
      where: {
        name: 'SUPER_ADMIN',
        userRoles: { some: { userId } },
      },
    });
    if (isSuperAdmin) return true;

    const hasScope = await this.prisma.permission.findFirst({
      where: {
        name: 'company:scope',
        rolePermissions: {
          some: {
            role: {
              userRoles: { some: { userId } },
            },
          },
        },
      },
    });
    return !!hasScope;
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException('Không tìm thấy doanh nghiệp');
    }
    return this.sanitizeCompany(company);
  }

  /**
   * Lấy company đầy đủ (gồm cả password/token) — chỉ dùng nội bộ,
   * KHÔNG trả về cho client.
   */
  private async findCompanyRaw(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException('Không tìm thấy doanh nghiệp');
    }
    return company;
  }

  async create(dto: CreateCompanyDto, userId: string) {
    const existing = await this.prisma.company.findUnique({
      where: { taxCode: dto.taxCode },
    });
    if (existing) {
      throw new ConflictException(
        `Doanh nghiệp với mã số thuế ${dto.taxCode} đã tồn tại`,
      );
    }

    const loginMode = dto.loginMode || 'AUTO';

    // AUTO: giải captcha bằng Gemini để lấy token ngay khi tạo.
    // MANUAL: tạo công ty trước với token = null, user sẽ bấm "Đăng nhập thủ công"
    // để nhập captcha từ giao diện (captcha hết hạn nhanh, không nhập ở form tạo).
    let token: string | null = null;
    if (loginMode === 'AUTO') {
      token = await this.gdtAuth.loginAuto(dto.taxCode, dto.lookupPassword);
    }

    const tokenExpiredAt = token ? this.gdtAuth.getTokenExpiration(token) : null;
    const resolvedName =
      dto.name ||
      (token ? await this.gdtAuth.getTaxpayerName(token) : '') ||
      dto.taxCode;

    return this.sanitizeCompany(
      await this.prisma.company.create({
        data: {
          taxCode: dto.taxCode,
          name: resolvedName,
          lookupPassword: dto.lookupPassword,
          loginMode,
          token,
          tokenExpiredAt,
          createdBy: userId,
        },
      }),
    );
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.findOne(id);

    return this.sanitizeCompany(
      await this.prisma.company.update({
        where: { id },
        data: dto,
      }),
    );
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.prisma.company.delete({ where: { id } });
    return { message: 'Đã xoá doanh nghiệp thành công' };
  }

  // ─── Token & Login ────────────────────────────────────────────────────────

  async refreshToken(id: string) {
    const company = await this.findCompanyRaw(id);

    if (company.loginMode !== 'AUTO') {
      throw new BadRequestException(
        'Chỉ doanh nghiệp ở chế độ TỰ ĐỘNG mới có thể làm mới token tự động',
      );
    }

    const token = await this.gdtAuth.loginAuto(
      company.taxCode,
      company.lookupPassword,
    );
    const tokenExpiredAt = this.gdtAuth.getTokenExpiration(token);
    const resolvedName =
      (await this.gdtAuth.getTaxpayerName(token)) || company.name;

    return this.sanitizeCompany(
      await this.prisma.company.update({
        where: { id },
        data: { token, tokenExpiredAt, name: resolvedName },
      }),
    );
  }

  async loginManual(id: string, dto: ManualLoginDto) {
    const company = await this.findCompanyRaw(id);

    const token = await this.gdtAuth.authenticate(
      company.taxCode,
      company.lookupPassword,
      dto.ckey,
      dto.cvalue,
    );
    const tokenExpiredAt = this.gdtAuth.getTokenExpiration(token);
    const resolvedName =
      (await this.gdtAuth.getTaxpayerName(token)) || company.name;

    return this.sanitizeCompany(
      await this.prisma.company.update({
        where: { id },
        data: { token, tokenExpiredAt, name: resolvedName },
      }),
    );
  }

  /**
   * Tạo captcha mới từ GDT để hiển thị cho người dùng giải ở frontend.
   * Không sinh phiên/lưu trạng thái: ckey được trả về client và gửi lại
   * kèm cvalue ở endpoint login-manual.
   */
  async getLoginManualCaptcha(id: string) {
    await this.findOne(id);
    return this.captchaResolver.fetchCaptchaAsPng();
  }

  // ─── Sync Info ────────────────────────────────────────────────────────────

  async syncCompanyInfo(id: string) {
    const company = await this.findCompanyRaw(id);

    try {
      const info = await this.maSoThueService.lookup(company.taxCode);

      return this.sanitizeCompany(
        await this.prisma.company.update({
          where: { id },
          data: {
            name: info.name !== 'Không xác định' ? info.name : company.name,
          address:
            info.address !== 'Đang cập nhật' ? info.address : null,
          taxAddress:
            info.taxAddress !== 'Đang cập nhật' ? info.taxAddress : null,
          representative:
            info.representative !== 'Đang cập nhật'
              ? info.representative
              : null,
          phone: info.phone !== 'Đang cập nhật' ? info.phone : null,
          activeDate:
            info.activeDate !== 'Đang cập nhật' ? info.activeDate : null,
          managedBy:
            info.managedBy !== 'Đang cập nhật' ? info.managedBy : null,
          companyType:
            info.type !== 'Đang cập nhật' ? info.type : null,
          status: info.status !== 'Đang cập nhật' ? info.status : null,
          lastSyncedAt: new Date(),
        },
      }),
    );
    } catch (error: any) {
      this.logger.error(
        `Failed to sync company info for ${company.taxCode}: ${error.message}`,
      );
      throw new BadRequestException(
        `Không thể đồng bộ thông tin doanh nghiệp: ${error.message}`,
      );
    }
  }
}
