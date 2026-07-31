import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendEmailVerification(email: string, token: string): Promise<void> {
    const appUrl = this.config.get<string>('APP_URL');
    const link = `${appUrl}/api/auth/verify-email?token=${token}`;
    // TODO: Replace with actual email provider (nodemailer, SES, Resend, ...)
    this.logger.log(`[EMAIL] Verify email for ${email}: ${link}`);
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const appUrl = this.config.get<string>('APP_URL');
    const link = `${appUrl}/reset-password?token=${token}`;
    // TODO: Replace with actual email provider
    this.logger.log(`[EMAIL] Reset password for ${email}: ${link}`);
  }
}
