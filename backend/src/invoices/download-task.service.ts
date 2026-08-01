import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter } from 'events';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { GdtAuthService } from '../ai/gdt-auth.service';
import { GdtClientService, GdtRawInvoice } from './gdt-client.service';
import { InvoicesPersistenceService } from './invoices-persistence.service';
import { XmlParserService } from './xml-parser.service';
import { ConfigService } from '@nestjs/config';
import { PaginationDto, PaginatedResult, paginate } from '../common/dto/pagination.dto';
import * as path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LogEntry {
  time: string;
  message: string;
  level: 'info' | 'warn' | 'error';
}

export type SseEventType =
  | 'connected'
  | 'start'
  | 'progress'
  | 'log'
  | 'done'
  | 'error';

export interface SseEventData {
  type: SseEventType;
  taskId?: string;
  invoiceType?: string;
  totalInvoices?: number;
  progress?: number;
  processed?: number;
  total?: number;
  message?: string;
  level?: 'info' | 'warn' | 'error';
  time?: string;
  result?: any;
  logs?: LogEntry[];
}

interface DownloadTaskParams {
  companyId: string;
  startDate: string;
  endDate: string;
  invoiceType?: string;
}

interface QueryTasksParams extends PaginationDto {
  status?: string;
  companyId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class DownloadTaskService {
  private readonly logger = new Logger(DownloadTaskService.name);
  private readonly eventEmitter = new EventEmitter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly gdtAuth: GdtAuthService,
    private readonly gdtClient: GdtClientService,
    private readonly persistence: InvoicesPersistenceService,
    private readonly xmlParser: XmlParserService,
  ) {
    // Tăng limit listener để hỗ trợ nhiều task cùng lúc
    this.eventEmitter.setMaxListeners(200);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Tạo task mới và bắt đầu chạy async.
   */
  async createAndStart(
    params: DownloadTaskParams,
    userId?: string,
  ): Promise<{ taskId: string }> {
    const { companyId, startDate, endDate, invoiceType = 'BOTH' } = params;

    // 1. Kiểm tra company tồn tại
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // 2. Chặn tạo task trùng lặp nếu đã có task đang chạy
    const existing = await this.prisma.downloadTask.findFirst({
      where: { companyId, status: { in: ['PENDING', 'RUNNING'] } },
    });

    if (existing) {
      throw new BadRequestException(
        `Doanh nghiệp này đã có một task đang chạy (task #${existing.id}). Vui lòng đợi task hoàn thành.`,
      );
    }

    // 3. Tạo task trong DB
    const task = await this.prisma.downloadTask.create({
      data: {
        companyId,
        createdBy: userId || null,
        status: 'PENDING',
        progress: 0,
        totalInvoices: 0,
        processedInvoices: 0,
        invoiceType,
        dateStart: startDate,
        dateEnd: endDate,
        logs: '[]',
      },
    });

    this.logger.log(
      `Created download task ${task.id} for company ${company.taxCode}`,
    );

    // 4. Chạy async (không await)
    this.executeTask(task.id, params).catch((err) => {
      this.logger.error(`Task ${task.id} failed: ${err.message}`, err.stack);
    });

    return { taskId: task.id };
  }

  /**
   * SSE stream cho frontend.
   * Trả về Observable để NestJS @Sse() decorator sử dụng.
   */
  getTaskStream(taskId: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      // 1. Gửi trạng thái hiện tại ngay khi kết nối
      this.sendCurrentState(taskId, subscriber);

      // 2. Subscribe các events mới
      const handler = (data: SseEventData) => {
        subscriber.next({ data: JSON.stringify(data) } as MessageEvent);
      };

      this.eventEmitter.on(taskId, handler);
      this.logger.debug(`SSE client subscribed to task ${taskId}`);

      // 3. Cleanup khi client disconnect
      return () => {
        this.eventEmitter.off(taskId, handler);
        this.logger.debug(`SSE client unsubscribed from task ${taskId}`);
      };
    });
  }

  /**
   * Kiểm tra task đang chạy của doanh nghiệp (dùng khi reload page).
   */
  async getActiveTaskForCompany(companyId: string) {
    const task = await this.prisma.downloadTask.findFirst({
      where: { companyId, status: { in: ['PENDING', 'RUNNING'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!task) return null;

    return {
      ...task,
      logs: JSON.parse(task.logs),
      result: task.result ? JSON.parse(task.result) : null,
    };
  }

  /**
   * Danh sách task (có phân trang + filter).
   */
  async findAll(query: QueryTasksParams): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 10,
      status,
      companyId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      ...(status && { status }),
      ...(companyId && { companyId }),
    };

    const [tasks, total] = await Promise.all([
      this.prisma.downloadTask.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          company: { select: { id: true, name: true, taxCode: true } },
        },
      }),
      this.prisma.downloadTask.count({ where }),
    ]);

    const data = tasks.map((t) => ({
      ...t,
      logs: JSON.parse(t.logs),
      result: t.result ? JSON.parse(t.result) : null,
    }));

    return paginate(data, total, page, limit);
  }

  /**
   * Chi tiết một task.
   */
  async findOne(taskId: string) {
    const task = await this.prisma.downloadTask.findUnique({
      where: { id: taskId },
      include: {
        company: { select: { id: true, name: true, taxCode: true } },
      },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    return {
      ...task,
      logs: JSON.parse(task.logs),
      result: task.result ? JSON.parse(task.result) : null,
    };
  }

  // ─── Private: Task Execution ─────────────────────────────────────────────

  /**
   * Thực thi task tải hoá đơn.
   * Logic tương tự InvoicesService.downloadInvoices() nhưng có emit events.
   */
  private async executeTask(
    taskId: string,
    params: DownloadTaskParams,
  ): Promise<void> {
    const { companyId, startDate, endDate, invoiceType = 'BOTH' } = params;

    try {
      // ── Cập nhật status RUNNING ──────────────────────────────────────
      await this.updateTask(taskId, { status: 'RUNNING' });
      this.emit(taskId, {
        type: 'connected',
        taskId,
        progress: 0,
        processed: 0,
        total: 0,
        logs: [],
      });

      // ── Resolve company + token ──────────────────────────────────────
      const { company, token } = await this.resolveCompanyAndToken(companyId, taskId);

      // ── Xác định loại cần tải ────────────────────────────────────────
      const types: Array<'BUY' | 'SELL'> =
        invoiceType === 'BOTH'
          ? ['BUY', 'SELL']
          : [invoiceType as 'BUY' | 'SELL'];

      const allResults: Array<{
        type: string;
        totalQueried: number;
        created: number;
        updated: number;
        itemsDownloaded: number;
        itemsFailed: number;
      }> = [];

      let grandTotal = 0;
      const invoicesBaseDir =
        this.config.get('INVOICES_DIR') || './invoices';

      // ── Tải từng loại BUY/SELL ───────────────────────────────────────
      for (const type of types) {
        const typeLabel = type === 'BUY' ? 'Mua vào' : 'Bán ra';

        await this.appendLog(taskId, {
          time: new Date().toISOString(),
          message: `Bắt đầu tải hoá đơn ${typeLabel} (${startDate} → ${endDate})`,
          level: 'info',
        });

        // Query GDT
        const invoices = await this.gdtClient.queryInvoices(
          new Date(startDate),
          new Date(endDate),
          token,
          type,
        );

        this.emit(taskId, {
          type: 'start',
          invoiceType: type,
          totalInvoices: invoices.length,
          message: `Tìm thấy ${invoices.length} hoá đơn ${typeLabel}`,
        });

        await this.appendLog(taskId, {
          time: new Date().toISOString(),
          message: `Tìm thấy ${invoices.length} hoá đơn ${typeLabel}`,
          level: 'info',
        });

        // Cập nhật tổng số hoá đơn
        await this.updateTask(taskId, {
          totalInvoices: invoices.length,
          processedInvoices: 0,
        });

        // Lưu metadata vào DB
        const stats = await this.persistence.bulkUpsert(
          invoices,
          type,
          'query',
          company.id,
        );

        await this.appendLog(taskId, {
          time: new Date().toISOString(),
          message: `Đã lưu metadata: ${stats.created} mới, ${stats.updated} cập nhật`,
          level: 'info',
        });

        // Tải ZIP + parse XML cho từng invoice
        const companyDir = this.sanitizeDirName(company.name);
        const outputDir = path.join(
          invoicesBaseDir,
          companyDir,
          type === 'SELL' ? 'BanRa' : 'MuaVao',
        );

        let itemsDownloaded = 0;
        let itemsFailed = 0;

        for (let i = 0; i < invoices.length; i++) {
          const inv = invoices[i];
          const invNum = String(inv.shdon);

          try {
            // Progress
            const progress = Math.round(((i + 1) / invoices.length) * 100);
            const message = `Đang tải hoá đơn ${invNum} (${i + 1}/${invoices.length})...`;

            this.emit(taskId, {
              type: 'progress',
              progress,
              processed: i + 1,
              total: invoices.length,
              invoiceType: type,
              message,
            });

            await this.appendLog(taskId, {
              time: new Date().toISOString(),
              message: `[${i + 1}/${invoices.length}] Đang tải ZIP cho ${invNum}...`,
              level: 'info',
            });

            // Tải ZIP
            const { zipPath } = await this.gdtClient.downloadInvoiceZip(
              inv,
              token,
              outputDir,
            );

            await this.appendLog(taskId, {
              time: new Date().toISOString(),
              message: `  ✓ Đã tải ZIP: ${path.basename(zipPath)}`,
              level: 'info',
            });

            // Giải nén → XML
            const xmlPath = this.xmlParser.extractXmlFromZip(
              zipPath,
              outputDir,
            );

            // Parse XML → items
            const parsed = this.xmlParser.parseInvoiceXml(xmlPath);

            await this.appendLog(taskId, {
              time: new Date().toISOString(),
              message: `  ✓ Parse XML: ${parsed.items.length} items`,
              level: 'info',
            });

            // Lưu items + paths vào DB
            await this.persistence.saveItemsFromZip(
              inv,
              type,
              parsed.items,
              zipPath,
              xmlPath,
            );

            itemsDownloaded++;

            // Cập nhật processedInvoices trong DB
            await this.updateTask(taskId, {
              progress,
              processedInvoices: i + 1,
            });
          } catch (error: any) {
            itemsFailed++;

            await this.appendLog(taskId, {
              time: new Date().toISOString(),
              message: `  ✗ Lỗi hoá đơn ${invNum}: ${error.message}`,
              level: 'error',
            });

            this.logger.warn(
              `Task ${taskId}: Failed invoice ${invNum}: ${error.message}`,
            );

            // Lưu error vào DB
            await this.persistence
              .markError(inv, type, error.message)
              .catch(() => {});
          }

          // Delay 500ms giữa các request
          if (i < invoices.length - 1) {
            await this.delay(500);
          }
        }

        allResults.push({
          type,
          totalQueried: invoices.length,
          ...stats,
          itemsDownloaded,
          itemsFailed,
        });

        grandTotal += stats.created + stats.updated;

        await this.appendLog(taskId, {
          time: new Date().toISOString(),
          message: `Hoàn thành ${typeLabel}: ${itemsDownloaded}/${invoices.length} hoá đơn (${itemsFailed} lỗi)`,
          level: itemsFailed > 0 ? 'warn' : 'info',
        });
      }

      // ── Cập nhật downloadCount ───────────────────────────────────────
      if (grandTotal > 0) {
        await this.prisma.company.update({
          where: { id: company.id },
          data: { downloadCount: { increment: grandTotal } },
        });
      }

      // ── Kết thúc ─────────────────────────────────────────────────────
      const result = {
        company: {
          id: company.id,
          name: company.name,
          taxCode: company.taxCode,
        },
        dateRange: { startDate, endDate },
        results: allResults,
        totalSaved: grandTotal,
      };

      this.emit(taskId, {
        type: 'done',
        result,
      });

      await this.appendLog(taskId, {
        time: new Date().toISOString(),
        message: `✅ Tất cả hoàn thành: ${grandTotal} hoá đơn đã lưu`,
        level: 'info',
      });

      await this.updateTask(taskId, {
        status: 'DONE',
        progress: 100,
        result: JSON.stringify(result),
      });

      // Cleanup EventEmitter listeners
      this.eventEmitter.removeAllListeners(taskId);

      this.logger.log(`Task ${taskId} completed successfully`);
    } catch (error: any) {
      this.logger.error(`Task ${taskId} failed: ${error.message}`, error.stack);

      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Unknown error';

      this.emit(taskId, {
        type: 'error',
        message: errorMessage,
      });

      await this.appendLog(taskId, {
        time: new Date().toISOString(),
        message: `❌ Task thất bại: ${errorMessage}`,
        level: 'error',
      }).catch(() => {});

      await this.updateTask(taskId, {
        status: 'ERROR',
        errorMessage,
      }).catch(() => {});

      // Cleanup EventEmitter listeners
      this.eventEmitter.removeAllListeners(taskId);
    }
  }

  // ─── Private: Token Resolution ───────────────────────────────────────────

  private async resolveCompanyAndToken(
    companyId: string,
    taskId: string,
  ): Promise<{ company: any; token: string }> {
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

      await this.appendLog(taskId, {
        time: new Date().toISOString(),
        message: `Token hết hạn, đang tự động refresh...`,
        level: 'info',
      });

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

      await this.appendLog(taskId, {
        time: new Date().toISOString(),
        message: `Token đã được refresh`,
        level: 'info',
      });
    }

    return { company, token };
  }

  // ─── Private: Helpers ────────────────────────────────────────────────────

  private emit(taskId: string, data: SseEventData): void {
    this.eventEmitter.emit(taskId, data);
  }

  private async updateTask(
    taskId: string,
    data: Partial<{
      status: string;
      progress: number;
      totalInvoices: number;
      processedInvoices: number;
      result: string;
      errorMessage: string | null;
    }>,
  ): Promise<void> {
    try {
      await this.prisma.downloadTask.update({
        where: { id: taskId },
        data,
      });
    } catch (err: any) {
      this.logger.error(`Failed to update task ${taskId}: ${err.message}`);
    }
  }

  private async appendLog(
    taskId: string,
    log: LogEntry,
  ): Promise<void> {
    try {
      const task = await this.prisma.downloadTask.findUnique({
        where: { id: taskId },
        select: { logs: true },
      });

      if (!task) return;

      const logs: LogEntry[] = JSON.parse(task.logs);

      // Giới hạn 500 dòng log để tránh DB quá lớn
      if (logs.length >= 500) {
        logs.splice(0, logs.length - 499);
      }

      logs.push(log);

      await this.prisma.downloadTask.update({
        where: { id: taskId },
        data: { logs: JSON.stringify(logs) },
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to append log for task ${taskId}: ${err.message}`,
      );
    }
  }

  /**
   * Gửi trạng thái hiện tại của task khi client mới kết nối SSE.
   */
  private async sendCurrentState(
    taskId: string,
    subscriber: any,
  ): Promise<void> {
    try {
      const task = await this.prisma.downloadTask.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        subscriber.next({
          data: JSON.stringify({
            type: 'error',
            message: `Task ${taskId} not found`,
          }),
        } as MessageEvent);
        return;
      }

      const logs: LogEntry[] = JSON.parse(task.logs);

      subscriber.next({
        data: JSON.stringify({
          type: 'connected',
          taskId: task.id,
          progress: task.progress,
          processed: task.processedInvoices,
          total: task.totalInvoices,
          invoiceType: task.invoiceType,
          status: task.status,
          logs,
        }),
      } as MessageEvent);

      // Nếu task đã DONE hoặc ERROR, gửi thêm event kết thúc
      if (task.status === 'DONE' && task.result) {
        subscriber.next({
          data: JSON.stringify({
            type: 'done',
            result: JSON.parse(task.result),
          }),
        } as MessageEvent);
      } else if (task.status === 'ERROR') {
        subscriber.next({
          data: JSON.stringify({
            type: 'error',
            message: task.errorMessage || 'Unknown error',
          }),
        } as MessageEvent);
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to send current state for task ${taskId}: ${err.message}`,
      );
    }
  }

  private sanitizeDirName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9À-ỹ\s]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 100);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
