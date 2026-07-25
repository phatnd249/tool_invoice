import nodemailer from 'nodemailer';

// Singleton transporter
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn('[MailService] SMTP không được cấu hình đầy đủ. Bỏ qua gửi email.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // true for 465, false for others
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Gửi email thông báo góp ý mới cho team dev.
 * Hàm này chạy bất đồng bộ (fire-and-forget), không throw lỗi ra ngoài.
 */
export async function sendFeedbackNotification(
  content: string,
  userInfo: { id: number; username: string },
): Promise<void> {
  const transport = getTransporter();
  if (!transport) return;

  const toEmail = process.env.FEEDBACK_EMAIL_TO;
  if (!toEmail) {
    console.warn('[MailService] FEEDBACK_EMAIL_TO chưa được cấu hình. Bỏ qua gửi email.');
    return;
  }

  const subject = `[Góp ý] Ý kiến mới từ ${userInfo.username}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">📝 Ý Kiến Đóng Góp Mới</h2>
      <hr style="border: 1px solid #e5e7eb;" />
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 120px; color: #6b7280;">Người gửi:</td>
          <td style="padding: 8px 0;">${userInfo.username} (ID: ${userInfo.id})</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Thời gian:</td>
          <td style="padding: 8px 0;">${new Date().toLocaleString('vi-VN')}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; color: #6b7280; vertical-align: top;">Nội dung:</td>
          <td style="padding: 8px 0; white-space: pre-wrap; background: #f9fafb; border-radius: 8px; padding: 12px;">
            ${content.replace(/\n/g, '<br/>')}
          </td>
        </tr>
      </table>
      <hr style="border: 1px solid #e5e7eb; margin-top: 16px;" />
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        Email này được gửi tự động từ hệ thống Invoice Downloader Pro
      </p>
    </div>
  `;

  try {
    await transport.sendMail({
      from: `"Invoice Feedback" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html,
    });
    console.log(`[MailService] Đã gửi email thông báo góp ý từ ${userInfo.username} đến ${toEmail}`);
  } catch (error: any) {
    console.error('[MailService] Lỗi gửi email:', error.message);
  }
}
