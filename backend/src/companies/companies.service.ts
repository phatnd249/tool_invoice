import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GdtAuthService } from '../ai/gdt-auth.service';
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
    private readonly maSoThueService: MaSoThueService,
  ) {}

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
      token = await this.gdtAuth.loginAuto(dto.taxCode, dto.lookupPassword);
    } else {
      if (!dto.ckey || !dto.cvalue) {
        throw new BadRequestException(
          'Captcha key and value are required for manual login mode',
        );
      }
      token = await this.gdtAuth.authenticate(
        dto.taxCode,
        dto.lookupPassword,
        dto.ckey,
        dto.cvalue,
      );
    }

    const tokenExpiredAt = this.gdtAuth.getTokenExpiration(token);
    const resolvedName =
      dto.name || (await this.gdtAuth.getTaxpayerName(token)) || dto.taxCode;

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
    await this.findOne(id);

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

    const token = await this.gdtAuth.loginAuto(
      company.taxCode,
      company.lookupPassword,
    );
    const tokenExpiredAt = this.gdtAuth.getTokenExpiration(token);
    const resolvedName =
      (await this.gdtAuth.getTaxpayerName(token)) || company.name;

    return this.prisma.company.update({
      where: { id },
      data: { token, tokenExpiredAt, name: resolvedName },
    });
  }

  async loginManual(id: string, dto: ManualLoginDto) {
    const company = await this.findOne(id);

    const token = await this.gdtAuth.authenticate(
      company.taxCode,
      company.lookupPassword,
      dto.ckey,
      dto.cvalue,
    );
    const tokenExpiredAt = this.gdtAuth.getTokenExpiration(token);
    const resolvedName =
      (await this.gdtAuth.getTaxpayerName(token)) || company.name;

    return this.prisma.company.update({
      where: { id },
      data: { token, tokenExpiredAt, name: resolvedName },
    });
  }

  // ─── Sync Info ────────────────────────────────────────────────────────────

  async syncCompanyInfo(id: string) {
    const company = await this.findOne(id);

    try {
      const info = await this.maSoThueService.lookup(company.taxCode);

      return this.prisma.company.update({
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
      });
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
