// backend/src/services/download-job.service.ts
// Service quản lý vòng đời của DownloadJob — lưu tiến trình tải vào DB
// để hỗ trợ reconnect SSE khi người dùng reload trang.

import { EventEmitter } from 'events';
import prisma from '../utils/db.js';
import { createLogger } from '../logger/index.js';

const log = createLogger('DownloadJobService');

// ─── Type Definitions ──────────────────────────────────────────

export interface CreateJobParams {
  companyId?: number;
  companyName?: string;
  taxCode?: string;
  userId?: number;
  username?: string;
  startDate?: Date;
  endDate?: Date;
  invoiceType: 'BUY' | 'SELL' | 'BOTH';
  overwriteMode?: string;
}

export interface JobLogEntry {
  time: string;
  message: string;
  type: 'info' | 'error' | 'warning' | 'system' | 'success';
}

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type PrismaDownloadJob = {
  id: string;
  companyId: number | null;
  companyName: string | null;
  taxCode: string | null;
  userId: number | null;
  username: string | null;
  startDate: Date | null;
  endDate: Date | null;
  invoiceType: string;
  overwriteMode: string;
  status: string;
  progressCurrent: number;
  progressTotal: number;
  progressMessage: string | null;
  progressType: string | null;
  successCount: number;
  errorCount: number;
  errors: string | null;
  logs: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Event Emitter cho Realtime ───────────────────────────────
// Các component (SSE handler) subscribe vào event 'progress:<jobId>'
// để nhận cập nhật realtime mà không cần polling.

class DownloadJobEventBus extends EventEmitter {}
export const jobEventBus = new DownloadJobEventBus();
jobEventBus.setMaxListeners(100);

// ─── Service Class ─────────────────────────────────────────────

export class DownloadJobService {
  /**
   * Tạo một job mới với status PENDING.
   */
  async create(params: CreateJobParams): Promise<string> {
    const job = await prisma.downloadJob.create({
      data: {
        companyId: params.companyId ?? null,
        companyName: params.companyName ?? null,
        taxCode: params.taxCode ?? null,
        userId: params.userId ?? null,
        username: params.username ?? null,
        startDate: params.startDate ?? null,
        endDate: params.endDate ?? null,
        invoiceType: params.invoiceType,
        overwriteMode: params.overwriteMode ?? 'SKIP',
        status: 'PENDING',
        progressCurrent: 0,
        progressTotal: 0,
        successCount: 0,
        errorCount: 0,
        logs: JSON.stringify([]),
        errors: JSON.stringify([]),
      },
    });

    log.info({ jobId: job.id, companyName: params.companyName }, 'Job created');
    return job.id;
  }

  /**
   * Set job status = RUNNING.
   */
  async start(jobId: string): Promise<void> {
    await prisma.downloadJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING' },
    });
    this._emit(jobId, 'status', { status: 'RUNNING' });
  }

  /**
   * Cập nhật tiến trình hiện tại.
   */
  async updateProgress(
    jobId: string,
    current: number,
    total: number,
    type?: string,
    message?: string,
  ): Promise<void> {
    await prisma.downloadJob.update({
      where: { id: jobId },
      data: {
        progressCurrent: current,
        progressTotal: total,
        progressType: type ?? null,
        progressMessage: message ?? null,
      },
    });
    this._emit(jobId, 'progress', { current, total, type, message });
  }

  /**
   * Thêm một log entry vào mảng logs.
   */
  async addLog(jobId: string, message: string, type: JobLogEntry['type'] = 'info'): Promise<void> {
    const job = await prisma.downloadJob.findUnique({
      where: { id: jobId },
      select: { logs: true },
    });
    if (!job) return;

    const logs: JobLogEntry[] = JSON.parse(job.logs || '[]');
    logs.push({ time: new Date().toISOString(), message, type });

    // Giới hạn 500 entries để tránh DB quá lớn
    if (logs.length > 500) {
      logs.splice(0, logs.length - 500);
    }

    await prisma.downloadJob.update({
      where: { id: jobId },
      data: { logs: JSON.stringify(logs) },
    });
    this._emit(jobId, 'log', { time: new Date().toISOString(), message, type });
  }

  /**
   * Thêm một lỗi vào danh sách errors.
   */
  async addError(jobId: string, errorMessage: string): Promise<void> {
    const job = await prisma.downloadJob.findUnique({
      where: { id: jobId },
      select: { errors: true, errorCount: true },
    });
    if (!job) return;

    const errors: string[] = JSON.parse(job.errors || '[]');
    errors.push(errorMessage);

    // Giới hạn 20 lỗi
    if (errors.length > 20) {
      errors.splice(0, errors.length - 20);
    }

    await prisma.downloadJob.update({
      where: { id: jobId },
      data: {
        errors: JSON.stringify(errors),
        errorCount: { increment: 1 },
      },
    });
    this._emit(jobId, 'error', { message: errorMessage });
  }

  /**
   * Set job status = COMPLETED với kết quả cuối.
   */
  async complete(jobId: string, successCount: number, errorCount: number): Promise<void> {
    await prisma.downloadJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        successCount,
        errorCount,
        progressMessage: `Hoàn thành: ${successCount} thành công, ${errorCount} lỗi`,
      },
    });
    this._emit(jobId, 'done', { successCount, errorCount });
    this._cleanup(jobId);
  }

  /**
   * Set job status = FAILED.
   */
  async fail(jobId: string, errorMessage: string): Promise<void> {
    await prisma.downloadJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        progressMessage: errorMessage,
      },
    });
    this._emit(jobId, 'error', { message: errorMessage });
    this._cleanup(jobId);
  }

  /**
   * Set job status = CANCELLED.
   */
  async cancel(jobId: string): Promise<void> {
    const job = await prisma.downloadJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (!job || job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
      return; // Không thể huỷ job đã kết thúc
    }

    await prisma.downloadJob.update({
      where: { id: jobId },
      data: { status: 'CANCELLED', progressMessage: 'Đã bị huỷ bởi người dùng' },
    });
    this._emit(jobId, 'cancelled', { message: 'Đã bị huỷ bởi người dùng' });
    this._cleanup(jobId);
  }

  /**
   * Lấy thông tin chi tiết một job.
   */
  async getById(jobId: string): Promise<PrismaDownloadJob | null> {
    return prisma.downloadJob.findUnique({ where: { id: jobId } }) as Promise<PrismaDownloadJob | null>;
  }

  /**
   * Lấy danh sách job active (PENDING / RUNNING) của một user.
   */
  async getActiveJobs(userId: number): Promise<PrismaDownloadJob[]> {
    return prisma.downloadJob.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
    }) as Promise<PrismaDownloadJob[]>;
  }

  /**
   * Lấy lịch sử job gần đây của user hoặc tất cả (admin).
   */
  async getRecentJobs(params: {
    userId?: number;
    limit?: number;
    status?: string;
  }): Promise<PrismaDownloadJob[]> {
    const where: any = {};
    if (params.userId) where.userId = params.userId;
    if (params.status) where.status = params.status;

    return prisma.downloadJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit || 20,
    }) as Promise<PrismaDownloadJob[]>;
  }

  /**
   * Xoá các job pending/running cũ (dọn dẹp khi start server).
   */
  async cleanupStaleJobs(): Promise<number> {
    const result = await prisma.downloadJob.updateMany({
      where: {
        status: { in: ['PENDING', 'RUNNING'] },
        updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // > 24h
      },
      data: {
        status: 'FAILED',
        progressMessage: 'Job bị huỷ do quá thời gian chờ (cleanup)',
      },
    });
    if (result.count > 0) {
      log.info({ count: result.count }, 'Cleaned up stale download jobs');
    }
    return result.count;
  }

  // ─── Private Helpers ───────────────────────────────────────

  /**
   * Emit event cho các subscriber realtime.
   */
  private _emit(jobId: string, event: string, data: any): void {
    jobEventBus.emit(`job:${jobId}:${event}`, data);
    // Event tổng hợp để dashboard có thể theo dõi
    jobEventBus.emit(`job:${jobId}:update`, { event, data });
  }

  /**
   * Dọn dẹp listeners khi job kết thúc.
   */
  private _cleanup(jobId: string): void {
    // Xoá các listener sau 5s để các SSE handler kịp nhận event cuối
    setTimeout(() => {
      jobEventBus.removeAllListeners(`job:${jobId}:progress`);
      jobEventBus.removeAllListeners(`job:${jobId}:log`);
      jobEventBus.removeAllListeners(`job:${jobId}:error`);
      jobEventBus.removeAllListeners(`job:${jobId}:done`);
      jobEventBus.removeAllListeners(`job:${jobId}:update`);
    }, 5000);
  }
}

// Singleton
export const downloadJobService = new DownloadJobService();
