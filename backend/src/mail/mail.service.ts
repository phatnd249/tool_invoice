import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = this.config.get<string>('SMTP_HOST');
    const port = this.config.get<number>('SMTP_PORT', 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP not configured (missing SMTP_HOST, SMTP_USER, or SMTP_PASS). Emails will be logged only.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    this.logger.log(`MailService initialized: ${host}:${port} as ${user}`);
  }

  private async sendMail(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`[MAIL STUB] To: ${to} | Subject: ${subject}`);
      return;
    }

    const from = this.config.get<string>(
      'SMTP_FROM',
      this.config.get<string>('SMTP_USER')!,
    );
    await this.transporter.sendMail({ from, to, subject, html });
    this.logger.log(`Email sent to ${to}: ${subject}`);
  }

  async sendEmailVerification(email: string, token: string): Promise<void> {
    const appUrl = this.config.get<string>('APP_URL');
    const link = `${appUrl}/api/auth/verify-email?token=${token}`;
    const html = `
      <h2>Xác thực email</h2>
      <p>Nhấn vào liên kết bên dưới để xác thực email của bạn:</p>
      <a href="${link}">${link}</a>
      <p>Liên kết có hiệu lực trong 24 giờ.</p>
    `;
    await this.sendMail(email, 'Xác thực email - Invoice Pro', html);
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const appUrl = this.config.get<string>('APP_URL');
    const link = `${appUrl}/reset-password?token=${token}`;
    const html = `
      <h2>Đặt lại mật khẩu</h2>
      <p>Nhấn vào liên kết bên dưới để đặt lại mật khẩu của bạn:</p>
      <a href="${link}">${link}</a>
      <p>Liên kết có hiệu lực trong 1 giờ.</p>
      <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
    `;
    await this.sendMail(email, 'Đặt lại mật khẩu - Invoice Pro', html);
  }

  async sendFeedback(data: {
    fromName: string;
    fromEmail: string;
    title: string;
    content: string;
    category: string;
  }): Promise<void> {
    const to = this.config.get<string>('FEEDBACK_TO_EMAIL');
    const safe = {
      fromName: this.escapeHtml(data.fromName),
      fromEmail: this.escapeHtml(data.fromEmail),
      title: this.escapeHtml(data.title),
      content: this.escapeHtml(data.content),
      category: this.escapeHtml(data.category),
    };
    if (!to) {
      this.logger.warn(
        'FEEDBACK_TO_EMAIL not configured. Feedback will be logged only.',
      );
      this.logger.log(
        `[FEEDBACK] From: ${data.fromName} <${data.fromEmail}> | Category: ${data.category} | ${data.title}`,
      );
      this.logger.log(`[FEEDBACK] Content: ${data.content}`);
      return;
    }

    const html = `
      <h2>Phản hồi mới từ Invoice Pro</h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;width:120px">Người gửi</td><td style="padding:8px;border:1px solid #ddd">${safe.fromName} (${safe.fromEmail})</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Danh mục</td><td style="padding:8px;border:1px solid #ddd">${safe.category}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Tiêu đề</td><td style="padding:8px;border:1px solid #ddd">${safe.title}</td></tr>
      </table>
      <h3>Nội dung:</h3>
      <p style="white-space:pre-wrap">${safe.content}</p>
    `;
    await this.sendMail(to, `[Feedback] ${data.category}: ${data.title}`, html);
  }

  private escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
