import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter } from 'events';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { GdtClientService, GdtRawInvoice } from './gdt-client.service';
import { InvoicesPersistenceService } from './invoices-persistence.service';
import { XmlParserService } from './xml-parser.service';
import { PreviewService } from './preview.service';
import { PdfService } from './pdf.service';
import { ConfigService } from '@nestjs/config';
import { PaginationDto, PaginatedResult, paginate } from '../common/dto/pagination.dto';
import {
  findNextVersion,
  getVersionedFilePath,
  removeAllRelatedFiles,
} from '../common/file-version';
import { sanitizeDirName, delay, getInvoiceFileStatusCode } from '../common/invoice-utils';
import { TokenResolverService } from '../common/token-resolver.service';
import { InvoiceDownloaderService } from './invoice-downloader.service';
import * as path from 'path';
import * as fs from 'fs';

// ─── Rate Limit Handler ────────────────────────────────────────────────────

/**
 * Quản lý trạng thái rate limit từ GDT.
 * Khi GDT liên tục trả 429, thời gian chờ tăng dần (exponential cooldown).
 * Khi có request thành công hoặc hết thời gian cooldown, tự reset.
 */
class RateLimitHandler {
  private consecutive429s = 0;
  private last429Time = 0;
  private cooldownUntil = 0;

  private readonly THRESHOLD = 3;
  private readonly BASE_COOLDOWN_MS = 10_000;   // 10 giây
  private readonly MAX_COOLDOWN_MS = 120_000;    // 2 phút

  /**
   * Xử lý khi gặp 429.
   * @returns Thời gian chờ (ms) trước khi tiếp tục.
   */
  handle429(): number {
    const now = Date.now();

    // Reset nếu đã qua 60s kể từ lần 429 cuối
    if (now - this.last429Time > 60_000) {
      this.consecutive429s = 0;
    }

    this.consecutive429s++;
    this.last429Time = now;

    if (this.consecutive429s < this.THRESHOLD) {
      return 2000; // 2 giây — delay nhẹ
    }

    // Exponential backoff: 10s → 20s → 40s... max 120s
    const multiplier = this.consecutive429s - this.THRESHOLD + 1;
    const delay = Math.min(this.BASE_COOLDOWN_MS * multiplier, this.MAX_COOLDOWN_MS);
    this.cooldownUntil = now + delay;
    return delay;
  }

  /** Reset sau khi request thành công (chỉ reset nếu đủ lâu từ lần 429 cuối) */
  handleSuccess(): void {
    const now = Date.now();
    if (now - this.last429Time > 30_000) {
      this.consecutive429s = 0;
      this.cooldownUntil = 0;
    }
  }

  isInCooldown(): boolean {
    return this.cooldownUntil > Date.now();
  }

  getRemainingCooldown(): number {
    return Math.max(0, this.cooldownUntil - Date.now());
  }
}

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
  overwriteMode?: string;
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
    private readonly tokenResolver: TokenResolverService,
    private readonly downloader: InvoiceDownloaderService,
    private readonly gdtClient: GdtClientService,
    private readonly persistence: InvoicesPersistenceService,
    private readonly xmlParser: XmlParserService,
    private readonly previewService: PreviewService,
    private readonly pdfService: PdfService,
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
      const { company, token } = await this.tokenResolver.resolve(companyId);

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
        const companyDir = sanitizeDirName(company.name);
        const typeDir =
          type === 'SELL' ? 'BanRa' : 'MuaVao';

        let itemsDownloaded = 0;
        let itemsFailed = 0;

        const rateLimitHandler = new RateLimitHandler();

        for (let i = 0; i < invoices.length; i++) {
          const inv = invoices[i];
          const invNum = String(inv.shdon);

          // ── Overwrite pre-check ────────────────────────────────
          const overwriteMode =
            (params.overwriteMode as string) || 'SKIP';
          let currentVersion = 0;

          const invDate = new Date(inv.tdlap);
          const outputDir = path.join(
            invoicesBaseDir,
            companyDir,
            typeDir,
            `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, '0')}`,
          );

          const statusCode = getInvoiceFileStatusCode(inv);
          const taxCode = String(inv.nbmst);
          const baseFileName = `${taxCode}-${invNum}-${statusCode}`;
          const zipFileName = `${baseFileName}.zip`;
          const zipPath = path.join(outputDir, zipFileName);

          if (overwriteMode === 'SKIP') {
            if (
              fs.existsSync(zipPath) &&
              (fs.statSync(zipPath).size || 0) > 0
            ) {
              await this.appendLog(taskId, {
                time: new Date().toISOString(),
                message: `  ⏭ Bỏ qua ${invNum}: đã có file ZIP`,
                level: 'info',
              });
              continue;
            }
          } else if (overwriteMode === 'OVERWRITE') {
            removeAllRelatedFiles(zipPath);
            await this.appendLog(taskId, {
              time: new Date().toISOString(),
              message: `  🔄 Ghi đè ${invNum}: đã xoá file cũ`,
              level: 'info',
            });
          } else if (overwriteMode === 'NEW_VERSION') {
            if (
              fs.existsSync(zipPath) &&
              (fs.statSync(zipPath).size || 0) > 0
            ) {
              currentVersion = findNextVersion(zipPath);
              await this.appendLog(taskId, {
                time: new Date().toISOString(),
                message: `  📋 Tạo bản sao v${currentVersion} cho ${invNum}`,
                level: 'info',
              });
            }
          }

          // ── Kiểm tra cooldown trước khi download ──────────────
          if (rateLimitHandler.isInCooldown()) {
            const waitMs = rateLimitHandler.getRemainingCooldown();
            await this.appendLog(taskId, {
              time: new Date().toISOString(),
              message: `⏳ Rate limit: đang tạm dừng ${Math.round(waitMs / 1000)}s trước khi tiếp tục...`,
              level: 'warn',
            });
            await delay(waitMs);
          }

          try {
            // Progress
            const progress = Math.round(((i + 1) / invoices.length) * 100);

            this.emit(taskId, {
              type: 'progress',
              progress,
              processed: i + 1,
              total: invoices.length,
              invoiceType: type,
              message: `Đang tải hoá đơn ${invNum} (${i + 1}/${invoices.length})...`,
            });

            await this.appendLog(taskId, {
              time: new Date().toISOString(),
              message: `[${i + 1}/${invoices.length}] Đang tải ZIP cho ${invNum}...`,
              level: 'info',
            });

            // Tải ZIP + parse + save + PDF (dùng chung downloader)
            const result = await this.downloader.downloadSingleInvoice({
              invoice: inv,
              token,
              type,
              companyName: company.name,
              overwriteMode: overwriteMode as 'SKIP' | 'OVERWRITE' | 'NEW_VERSION',
              currentVersion,
            });

            itemsDownloaded++;

            await this.appendLog(taskId, {
              time: new Date().toISOString(),
              message: `  ✓ Đã tải ZIP: ${result.zipPath ? path.basename(result.zipPath) : invNum + '.zip'}`,
              level: 'info',
            });

            await this.appendLog(taskId, {
              time: new Date().toISOString(),
              message: `  ✓ Parse XML: ${result.itemsCount} items`,
              level: 'info',
            });

            if (result.pdfPath) {
              await this.appendLog(taskId, {
                time: new Date().toISOString(),
                message: `  ✓ PDF: ${path.basename(result.pdfPath)}`,
                level: 'info',
              });
            }

            // Báo thành công cho rate limit handler
            rateLimitHandler.handleSuccess();

            // Cập nhật processedInvoices
            await this.updateTask(taskId, {
              progress,
              processedInvoices: i + 1,
            });
          } catch (error: any) {
            itemsFailed++;

            const statusCode = error?.statusCode || 0;

            if (statusCode === 429) {
              // ── Rate limit: tạm dừng và chờ, KHÔNG ghi markError ──
              const cooldownMs = rateLimitHandler.handle429();
              await this.appendLog(taskId, {
                time: new Date().toISOString(),
                message: `⏳ GDT rate limit (HTTP 429) cho hoá đơn ${invNum}. Tạm dừng ${Math.round(cooldownMs / 1000)}s...`,
                level: 'warn',
              });
              this.logger.warn(
                `Task ${taskId}: Rate limited on invoice ${invNum}. Cooling down ${Math.round(cooldownMs / 1000)}s`,
              );
              await delay(cooldownMs);
            } else {
              // ── Lỗi thực sự (500, timeout, etc.): ghi log + mark error ──
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
          }

          // Delay 500ms giữa các request
          if (i < invoices.length - 1) {
            await delay(500);
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
    // Emit SSE event ngay lập tức để frontend nhận log real-time
    this.emit(taskId, {
      type: 'log',
      level: log.level,
      message: log.message,
      time: log.time,
    });

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
}
