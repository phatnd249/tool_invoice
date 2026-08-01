import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GdtAuthService } from '../ai/gdt-auth.service';

/**
 * Service dùng chung để resolve company + token cho GDT API.
 * Gộp logic từ InvoicesService và DownloadTaskService.
 *
 * Flow:
 * 1. Query company từ DB
 * 2. Nếu token null hoặc hết hạn → auto-refresh (chỉ khi loginMode=AUTO)
 * 3. Trả về { company, token }
 */
@Injectable()
export class TokenResolverService {
  private readonly logger = new Logger(TokenResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gdtAuth: GdtAuthService,
  ) {}

  async resolve(companyId: string): Promise<{ company: any; token: string }> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    let token = company.token;

    if (!token || this.gdtAuth.isTokenExpired(token)) {
      if (company.loginMode !== 'AUTO') {
        throw new BadRequestException(
          `Token của ${company.name} (${company.taxCode}) đã hết hạn. Vui lòng đăng nhập lại thủ công.`,
        );
      }

      this.logger.log(
        `Token expired for ${company.taxCode}, auto-refreshing...`,
      );

      token = await this.gdtAuth.loginAuto(
        company.taxCode,
        company.lookupPassword,
      );

      await this.prisma.company.update({
        where: { id: company.id },
        data: {
          token,
          tokenExpiredAt: this.gdtAuth.getTokenExpiration(token),
        },
      });

      this.logger.log(`Token refreshed for ${company.taxCode}`);
    }

    return { company, token };
  }
}
