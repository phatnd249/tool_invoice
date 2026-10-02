import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import * as fs from 'fs';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { encryptToken, decryptToken } from '../common/crypto.util';

export interface DriveFileInfo {
  id: string;
  name: string;
  size: number;
  createdTime: string;
  webViewLink?: string;
}

export interface DriveConfigInfo {
  isConfigured: boolean;
  authMethod: 'OAUTH' | 'NOT_CONFIGURED';
  clientEmail: string | null;
  folderId: string | null;
  folderName: string | null;
  folderUrl?: string | null;
  isConnected: boolean;
  hasOAuthConfig: boolean;
  oauthClientId: string | null;
  lastTestedAt?: Date | null;
  lastError?: string | null;
}

export interface OAuthCredentials {
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string;
}

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lấy Folder ID cấu hình trong file .env (nếu có)
   */
  private getEnvFolderId(): string | null {
    const raw = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
    if (!raw) return null;
    const urlMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    return raw.split('?')[0].split('&')[0].trim() || null;
  }

  /**
   * Lấy Folder ID đang kích hoạt (ưu tiên từ DB BackupSetting, sau đó fallback về .env)
   */
  async getFolderId(): Promise<string | null> {
    const setting = await this.prisma.backupSetting.findUnique({
      where: { id: 'default' },
    });
    if (setting?.folderId && setting.folderId.trim() !== '') {
      return setting.folderId.trim();
    }
    return this.getEnvFolderId();
  }

  /**
   * Lấy thông tin OAuth Client ID & Secret (ưu tiên từ DB, sau đó fallback về .env)
   */
  async getOAuthCredentials(customRedirectUri?: string): Promise<OAuthCredentials> {
    const setting = await this.prisma.backupSetting.findUnique({
      where: { id: 'default' },
    });

    let clientId = setting?.oauthClientId?.trim() || null;
    let clientSecret: string | null = null;

    if (setting?.oauthClientSecret) {
      try {
        clientSecret = decryptToken(setting.oauthClientSecret).trim();
      } catch (err: any) {
        this.logger.warn(`Lỗi giải mã oauthClientSecret từ DB: ${err.message}`);
      }
    }

    // Fallback về .env
    if (!clientId) {
      clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || null;
    }
    if (!clientSecret) {
      clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || null;
    }

    const defaultRedirect =
      process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ||
      `${process.env.APP_URL || 'http://localhost:5173'}/backup`;

    const redirectUri = customRedirectUri || defaultRedirect;

    return {
      clientId,
      clientSecret,
      redirectUri,
    };
  }

  /**
   * Lưu thông tin OAuth Client ID & Secret cấu hình trực tiếp từ giao diện web
   */
  async saveOAuthCredentials(
    clientId: string,
    clientSecret: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!clientId || !clientId.trim() || !clientSecret || !clientSecret.trim()) {
      throw new BadRequestException('Vui lòng cung cấp đầy đủ Client ID và Client Secret');
    }

    const encryptedSecret = encryptToken(clientSecret.trim());

    await this.prisma.backupSetting.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        oauthClientId: clientId.trim(),
        oauthClientSecret: encryptedSecret,
      },
      update: {
        oauthClientId: clientId.trim(),
        oauthClientSecret: encryptedSecret,
      },
    });

    this.logger.log('Đã cập nhật thông tin Google OAuth Client ID & Secret vào database');

    return {
      success: true,
      message: 'Đã lưu cấu hình Google OAuth thành công!',
    };
  }

  /**
   * Tạo đường dẫn cấp quyền Google OAuth 2.0 Web Flow
   */
  async getOAuthAuthUrl(customRedirectUri?: string): Promise<{ url: string }> {
    const creds = await this.getOAuthCredentials(customRedirectUri);

    if (!creds.clientId || !creds.clientSecret) {
      throw new BadRequestException(
        'Chưa cấu hình Google OAuth Client ID & Client Secret. Vui lòng cấu hình trên giao diện hoặc trong file .env.',
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      creds.redirectUri,
    );

    const scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
    });

    return { url };
  }

  /**
   * Xử lý callback sau khi người dùng đồng ý cấp quyền trên Google
   */
  async handleOAuthCallback(
    code: string,
    customRedirectUri?: string,
  ): Promise<{
    success: boolean;
    message: string;
    email: string;
    folderId: string;
    folderName: string;
  }> {
    if (!code || !code.trim()) {
      throw new BadRequestException('Mã xác thực (code) không hợp lệ');
    }

    const creds = await this.getOAuthCredentials(customRedirectUri);
    if (!creds.clientId || !creds.clientSecret) {
      throw new BadRequestException('Chưa cấu hình Google OAuth Client ID & Secret');
    }

    const oauth2Client = new google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      creds.redirectUri,
    );

    let tokens: any;
    try {
      const tokenRes = await oauth2Client.getToken(code.trim());
      tokens = tokenRes.tokens;
    } catch (err: any) {
      this.logger.error(`Lỗi đổi Authorization Code lấy Token: ${err.message}`, err.stack);
      throw new BadRequestException(`Không thể xác thực với Google: ${err.message}`);
    }

    oauth2Client.setCredentials(tokens);

    // Kiểm tra refresh token
    const existing = await this.prisma.backupSetting.findUnique({
      where: { id: 'default' },
    });
    if (!tokens.refresh_token && !existing?.refreshToken) {
      throw new BadRequestException(
        'Google không trả về Refresh Token. Vui lòng thử đăng nhập lại và chọn "Cho phép tất cả quyền".',
      );
    }

    // Lấy email tài khoản Google người dùng
    let email = 'Google Account';
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      if (userInfo.data.email) {
        email = userInfo.data.email;
      }
    } catch (err: any) {
      this.logger.warn(`Không lấy được thông tin email Google: ${err.message}`);
    }

    // Tự động kiểm tra hoặc tạo thư mục mặc định Invoice_Pro_Backups trên Drive người dùng
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    let folderId = (await this.getFolderId()) || '';
    let folderName = 'Invoice_Pro_Backups';
    let folderUrl: string | undefined = undefined;

    if (folderId) {
      try {
        const folderRes = await drive.files.get({
          fileId: folderId,
          fields: 'id, name, mimeType, webViewLink',
          supportsAllDrives: true,
        });
        folderName = folderRes.data.name || folderName;
        folderUrl = folderRes.data.webViewLink || undefined;
      } catch {
        folderId = '';
      }
    }

    if (!folderId) {
      try {
        // Tìm xem đã có thư mục Invoice_Pro_Backups trên Drive chưa
        const searchRes = await drive.files.list({
          q: "mimeType = 'application/vnd.google-apps.folder' and name = 'Invoice_Pro_Backups' and trashed = false",
          fields: 'files(id, name, webViewLink)',
          pageSize: 1,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        if (searchRes.data.files && searchRes.data.files.length > 0) {
          folderId = searchRes.data.files[0].id!;
          folderName = searchRes.data.files[0].name!;
          folderUrl = searchRes.data.files[0].webViewLink || undefined;
        } else {
          // Tạo thư mục mới Invoice_Pro_Backups
          const createRes = await drive.files.create({
            requestBody: {
              name: 'Invoice_Pro_Backups',
              mimeType: 'application/vnd.google-apps.folder',
              description: 'Thư mục tự động sao lưu dữ liệu hệ thống Invoice Pro',
            },
            fields: 'id, name, webViewLink',
            supportsAllDrives: true,
          });
          folderId = createRes.data.id!;
          folderName = createRes.data.name!;
          folderUrl = createRes.data.webViewLink || undefined;
          this.logger.log(`Đã tự động tạo thư mục backup mới: ${folderName} (${folderId})`);
        }
      } catch (err: any) {
        this.logger.warn(`Không thể tự động tạo thư mục backup: ${err.message}`);
      }
    }

    const refreshTokenToSave = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : existing?.refreshToken;

    const accessTokenToSave = tokens.access_token
      ? encryptToken(tokens.access_token)
      : null;

    const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    await this.prisma.backupSetting.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        authMethod: 'OAUTH',
        accountEmail: email,
        refreshToken: refreshTokenToSave,
        accessToken: accessTokenToSave,
        tokenExpiry,
        folderId: folderId || null,
        folderName: folderName || null,
        folderUrl: folderUrl || null,
        isConnected: true,
        lastTestedAt: new Date(),
        lastError: null,
      },
      update: {
        authMethod: 'OAUTH',
        accountEmail: email,
        refreshToken: refreshTokenToSave,
        accessToken: accessTokenToSave,
        tokenExpiry,
        folderId: folderId || undefined,
        folderName: folderName || undefined,
        folderUrl: folderUrl || undefined,
        isConnected: true,
        lastTestedAt: new Date(),
        lastError: null,
      },
    });

    this.logger.log(`Kết nối Google Drive OAuth thành công cho tài khoản ${email}`);

    return {
      success: true,
      message: `Kết nối thành công tài khoản Google Drive (${email})!`,
      email,
      folderId,
      folderName,
    };
  }

  /**
   * Ngắt kết nối tài khoản Google Drive (xóa token khỏi database)
   */
  async disconnectOAuth(): Promise<{ success: boolean; message: string }> {
    await this.prisma.backupSetting.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        isConnected: false,
        refreshToken: null,
        accessToken: null,
        tokenExpiry: null,
        accountEmail: null,
        folderId: null,
        folderName: null,
        folderUrl: null,
        serviceAccountJson: null,
        lastError: null,
      },
      update: {
        isConnected: false,
        refreshToken: null,
        accessToken: null,
        tokenExpiry: null,
        accountEmail: null,
        folderId: null,
        folderName: null,
        folderUrl: null,
        serviceAccountJson: null,
        lastError: null,
      },
    });

    this.logger.log('Đã ngắt kết nối Google Drive OAuth');
    return {
      success: true,
      message: 'Đã ngắt kết nối tài khoản Google Drive thành công.',
    };
  }

  /**
   * Kiểm tra xem cấu hình backup Google Drive đã sẵn sàng hay chưa
   */
  async isConfigured(): Promise<boolean> {
    const setting = await this.prisma.backupSetting.findUnique({
      where: { id: 'default' },
    });
    if (!setting?.refreshToken || setting.isConnected === false) return false;
    const folderId = await this.getFolderId();
    return Boolean(folderId);
  }

  /**
   * Lấy email tài khoản Google đang kết nối
   */
  async getClientEmail(): Promise<string | null> {
    const setting = await this.prisma.backupSetting.findUnique({
      where: { id: 'default' },
    });
    if (!setting?.refreshToken || setting.isConnected === false) return null;
    return setting?.accountEmail || null;
  }

  /**
   * Lấy đầy đủ thông tin trạng thái Drive Configuration
   */
  async getDriveConfigInfo(): Promise<DriveConfigInfo> {
    const setting = await this.prisma.backupSetting.findUnique({
      where: { id: 'default' },
    });
    const isConfigured = await this.isConfigured();
    const creds = await this.getOAuthCredentials();
    const hasOAuthConfig = Boolean(creds.clientId && creds.clientSecret);
    const folderId = isConfigured ? await this.getFolderId() : null;

    return {
      isConfigured,
      authMethod: isConfigured ? 'OAUTH' : 'NOT_CONFIGURED',
      clientEmail: isConfigured ? (setting?.accountEmail || null) : null,
      folderId,
      folderName: isConfigured ? (setting?.folderName || null) : null,
      folderUrl: isConfigured ? (setting?.folderUrl || null) : null,
      isConnected: isConfigured,
      hasOAuthConfig,
      oauthClientId: creds.clientId
        ? `${creds.clientId.substring(0, 15)}...${creds.clientId.slice(-10)}`
        : null,
      lastTestedAt: setting?.lastTestedAt || null,
      lastError: setting?.lastError || null,
    };
  }

  /**
   * Khởi tạo Google Drive client từ Google OAuth 2.0 Refresh Token
   */
  private async getDriveClient(): Promise<drive_v3.Drive> {
    const setting = await this.prisma.backupSetting.findUnique({
      where: { id: 'default' },
    });

    if (!setting?.refreshToken) {
      throw new BadRequestException(
        'Google Drive chưa được kết nối qua OAuth. Vui lòng nhấn "Kết nối Google Drive" để đăng nhập tài khoản của bạn.',
      );
    }

    const creds = await this.getOAuthCredentials();
    if (!creds.clientId || !creds.clientSecret) {
      throw new BadRequestException(
        'Chưa cấu hình Google OAuth Client ID & Secret. Vui lòng kiểm tra lại cấu hình.',
      );
    }

    let decryptedRefreshToken: string;
    try {
      decryptedRefreshToken = decryptToken(setting.refreshToken);
    } catch (err: any) {
      throw new BadRequestException(`Không thể giải mã Refresh Token: ${err.message}`);
    }

    let decryptedAccessToken: string | undefined = undefined;
    if (setting.accessToken) {
      try {
        decryptedAccessToken = decryptToken(setting.accessToken);
      } catch {
        // Có thể lấy lại access token từ refresh token
      }
    }

    const oauth2Client = new google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      creds.redirectUri,
    );

    oauth2Client.setCredentials({
      refresh_token: decryptedRefreshToken,
      access_token: decryptedAccessToken,
      expiry_date: setting.tokenExpiry ? setting.tokenExpiry.getTime() : undefined,
    });

    // Tự động lưu access_token mới khi Google tự làm mới token
    oauth2Client.on('tokens', async (newTokens) => {
      try {
        const updates: any = {};
        if (newTokens.access_token) {
          updates.accessToken = encryptToken(newTokens.access_token);
        }
        if (newTokens.expiry_date) {
          updates.tokenExpiry = new Date(newTokens.expiry_date);
        }
        if (newTokens.refresh_token) {
          updates.refreshToken = encryptToken(newTokens.refresh_token);
        }
        if (Object.keys(updates).length > 0) {
          await this.prisma.backupSetting.update({
            where: { id: 'default' },
            data: updates,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Lỗi cập nhật token mới vào DB: ${err.message}`);
      }
    });

    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Cập nhật thư mục lưu trữ trên Google Drive
   */
  async updateFolder(folderIdOrUrl: string): Promise<{
    success: boolean;
    folderId: string;
    folderName: string;
    folderUrl?: string;
  }> {
    let cleanFolderId = folderIdOrUrl.trim();
    const urlMatch = cleanFolderId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) {
      cleanFolderId = urlMatch[1];
    } else {
      cleanFolderId = cleanFolderId.split('?')[0].split('&')[0].trim();
    }

    if (!cleanFolderId) {
      throw new BadRequestException('ID hoặc link thư mục Google Drive không hợp lệ');
    }

    const drive = await this.getDriveClient();
    const folderRes = await drive.files.get({
      fileId: cleanFolderId,
      fields: 'id, name, mimeType, webViewLink',
      supportsAllDrives: true,
    });

    if (folderRes.data.mimeType !== 'application/vnd.google-apps.folder') {
      throw new BadRequestException(
        `ID "${cleanFolderId}" không phải là một thư mục trên Google Drive (mimeType: ${folderRes.data.mimeType})`,
      );
    }

    const folderName = folderRes.data.name || 'Thư mục Drive';
    const folderUrl = folderRes.data.webViewLink || undefined;

    await this.prisma.backupSetting.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        folderId: cleanFolderId,
        folderName,
        folderUrl,
        isConnected: true,
        lastTestedAt: new Date(),
        lastError: null,
      },
      update: {
        folderId: cleanFolderId,
        folderName,
        folderUrl,
        isConnected: true,
        lastTestedAt: new Date(),
        lastError: null,
      },
    });

    return {
      success: true,
      folderId: cleanFolderId,
      folderName,
      folderUrl,
    };
  }

  /**
   * Kiểm tra kết nối Google Drive và quyền truy cập thư mục
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    folderName?: string;
    folderId?: string;
    clientEmail?: string;
  }> {
    const folderId = await this.getFolderId();
    if (!folderId) {
      return {
        success: false,
        message: 'Chưa cấu hình thư mục lưu trữ trên Google Drive (Folder ID)',
      };
    }

    const clientEmail = (await this.getClientEmail()) || undefined;

    try {
      const drive = await this.getDriveClient();
      const folderRes = await drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType, webViewLink',
        supportsAllDrives: true,
      });

      const folderData = folderRes.data;
      if (
        folderData.mimeType !== 'application/vnd.google-apps.folder' &&
        folderId !== 'root'
      ) {
        return {
          success: false,
          message: `ID "${folderId}" không phải là thư mục Google Drive (mimeType: ${folderData.mimeType})`,
        };
      }

      const folderName = folderData.name || 'Thư mục Google Drive';

      await this.prisma.backupSetting.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          folderId,
          folderName,
          folderUrl: folderData.webViewLink || null,
          isConnected: true,
          lastTestedAt: new Date(),
          lastError: null,
        },
        update: {
          folderId,
          folderName,
          folderUrl: folderData.webViewLink || undefined,
          isConnected: true,
          lastTestedAt: new Date(),
          lastError: null,
        },
      });

      return {
        success: true,
        message: `Kết nối thành công đến thư mục "${folderName}" trên Google Drive`,
        folderName,
        folderId,
        clientEmail,
      };
    } catch (err: any) {
      this.logger.error(`Lỗi kiểm tra kết nối Google Drive: ${err.message}`, err.stack);
      let errorDetail = err.message;

      if (err.code === 404) {
        errorDetail = `Không tìm thấy thư mục với ID "${folderId}" trên Google Drive. Hãy kiểm tra lại ID hoặc phân quyền.`;
      } else if (err.code === 401 || err.code === 403) {
        errorDetail = `Phiên đăng nhập Google Drive đã hết hạn hoặc bị từ chối. Vui lòng nhấn "Kết nối lại" để xác thực.`;
      }

      await this.prisma.backupSetting.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          isConnected: false,
          lastTestedAt: new Date(),
          lastError: errorDetail,
        },
        update: {
          isConnected: false,
          lastTestedAt: new Date(),
          lastError: errorDetail,
        },
      });

      return {
        success: false,
        message: `Kết nối thất bại: ${errorDetail}`,
        folderId,
        clientEmail,
      };
    }
  }

  /**
   * Upload file zip sao lưu lên Google Drive
   */
  async uploadFile(
    localFilePath: string,
    fileName: string,
  ): Promise<{ fileId: string; fileName: string; webViewLink?: string; size: number }> {
    const folderId = await this.getFolderId();
    if (!folderId) {
      throw new Error('Chưa cấu hình thư mục lưu trữ Google Drive');
    }

    const drive = await this.getDriveClient();
    const stat = fs.statSync(localFilePath);
    const fileStream = fs.createReadStream(localFilePath);

    this.logger.log(
      `Bắt đầu tải lên Google Drive: ${fileName} (${(stat.size / 1024 / 1024).toFixed(2)} MB)...`,
    );

    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        description: `Sao lưu hệ thống Invoice Pro ngày ${new Date().toISOString()}`,
      },
      media: {
        mimeType: 'application/zip',
        body: fileStream,
      },
      fields: 'id, name, size, webViewLink, webContentLink',
      supportsAllDrives: true,
    });

    const file = res.data;
    if (!file.id) {
      throw new Error('Không nhận được file ID sau khi tải lên Google Drive');
    }

    this.logger.log(`Tải lên Google Drive thành công: ID=${file.id}, File=${fileName}`);

    return {
      fileId: file.id,
      fileName: file.name || fileName,
      webViewLink: file.webViewLink || undefined,
      size: stat.size,
    };
  }

  /**
   * Lấy danh sách các file backup hiện có trong thư mục trên Google Drive
   */
  async listFiles(): Promise<DriveFileInfo[]> {
    const folderId = await this.getFolderId();
    const isConfigured = await this.isConfigured();
    if (!folderId || !isConfigured) return [];

    try {
      const drive = await this.getDriveClient();
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, size, createdTime, webViewLink)',
        orderBy: 'createdTime desc',
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const files = res.data.files || [];
      return files.map((f) => ({
        id: f.id || '',
        name: f.name || 'unnamed',
        size: Number(f.size) || 0,
        createdTime: f.createdTime || new Date().toISOString(),
        webViewLink: f.webViewLink || undefined,
      }));
    } catch (err: any) {
      this.logger.error(`Lỗi lấy danh sách file từ Google Drive: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * Xóa 1 file sao lưu trên Google Drive
   */
  async deleteFile(fileId: string): Promise<void> {
    const drive = await this.getDriveClient();
    await drive.files.delete({
      fileId,
      supportsAllDrives: true,
    });
    this.logger.log(`Đã xoá file trên Google Drive: ${fileId}`);
  }

  /**
   * Tải file từ Google Drive dạng stream để chuyển tiếp cho client download
   */
  async downloadFileStream(fileId: string): Promise<{
    stream: Readable;
    fileName: string;
    size?: number;
  }> {
    const drive = await this.getDriveClient();

    const meta = await drive.files.get({
      fileId,
      fields: 'id, name, size',
      supportsAllDrives: true,
    });

    const fileName = meta.data.name || `backup-${fileId}.zip`;
    const size = meta.data.size ? Number(meta.data.size) : undefined;

    const res = await drive.files.get(
      {
        fileId,
        alt: 'media',
        supportsAllDrives: true,
      },
      { responseType: 'stream' },
    );

    return {
      stream: res.data as Readable,
      fileName,
      size,
    };
  }

  /**
   * Tự động xóa các bản sao lưu cũ trên Google Drive vượt quá số lượng lưu giữ (retentionCount)
   */
  async pruneOldBackups(
    retentionCount: number,
  ): Promise<{ deletedCount: number; deletedFiles: string[] }> {
    if (retentionCount <= 0) return { deletedCount: 0, deletedFiles: [] };

    try {
      const files = await this.listFiles();
      const backupFiles = files.filter((f) => f.name.endsWith('.zip'));

      const sessionMap = new Map<string, DriveFileInfo[]>();
      for (const file of backupFiles) {
        const match = file.name.match(
          /^(invoice_backup_\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{2}[-_]\d{2}[-_]\d{2})/,
        );
        const sessionKey = match ? match[1] : file.name;
        if (!sessionMap.has(sessionKey)) {
          sessionMap.set(sessionKey, []);
        }
        sessionMap.get(sessionKey)!.push(file);
      }

      const sessions = Array.from(sessionMap.entries());
      if (sessions.length <= retentionCount) {
        return { deletedCount: 0, deletedFiles: [] };
      }

      const sessionsToDelete = sessions.slice(retentionCount);
      const deletedFiles: string[] = [];

      for (const [, sessionFiles] of sessionsToDelete) {
        for (const file of sessionFiles) {
          try {
            await this.deleteFile(file.id);
            deletedFiles.push(file.name);
            this.logger.log(`Tự động dọn dẹp bản backup cũ: ${file.name} (${file.id})`);
          } catch (err: any) {
            this.logger.warn(`Không thể xoá bản backup cũ ${file.name}: ${err.message}`);
          }
        }
      }

      return {
        deletedCount: deletedFiles.length,
        deletedFiles,
      };
    } catch (err: any) {
      this.logger.warn(`Lỗi khi dọn dẹp bản backup cũ: ${err.message}`);
      return { deletedCount: 0, deletedFiles: [] };
    }
  }
}
