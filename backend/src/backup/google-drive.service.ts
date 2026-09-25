import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

export interface DriveFileInfo {
  id: string;
  name: string;
  size: number;
  createdTime: string;
  webViewLink?: string;
}

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  /**
   * Determine whether Google Drive credentials and Folder ID are configured.
   */
  isConfigured(): boolean {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId || folderId.trim() === '') return false;

    // Check Service Account Key Path
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (keyPath && fs.existsSync(this.resolveFilePath(keyPath))) return true;

    // Check JSON content in env
    const jsonContent = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (jsonContent && jsonContent.trim() !== '') {
      try {
        JSON.parse(jsonContent);
        return true;
      } catch {
        // invalid json
      }
    }

    // Check individual client email + private key
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (clientEmail && privateKey) return true;

    return false;
  }

  getAuthMethod(): 'KEY_PATH' | 'KEY_JSON' | 'ENV_CREDENTIALS' | 'NOT_CONFIGURED' {
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (keyPath && fs.existsSync(this.resolveFilePath(keyPath))) return 'KEY_PATH';

    const jsonContent = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (jsonContent && jsonContent.trim() !== '') return 'KEY_JSON';

    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (clientEmail && privateKey) return 'ENV_CREDENTIALS';

    return 'NOT_CONFIGURED';
  }

  getClientEmail(): string | null {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL;
    if (clientEmail) return clientEmail;

    const jsonContent = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (jsonContent) {
      try {
        const parsed = JSON.parse(jsonContent);
        if (parsed.client_email) return parsed.client_email;
      } catch {
        // ignore
      }
    }

    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (keyPath) {
      const resolved = this.resolveFilePath(keyPath);
      if (fs.existsSync(resolved)) {
        try {
          const raw = fs.readFileSync(resolved, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed.client_email) return parsed.client_email;
        } catch {
          // ignore
        }
      }
    }

    return null;
  }

  getFolderId(): string | null {
    return process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null;
  }

  private resolveFilePath(p: string): string {
    if (path.isAbsolute(p)) return p;
    return path.resolve(process.cwd(), p);
  }

  private getDriveClient() {
    const scopes = ['https://www.googleapis.com/auth/drive'];

    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (keyPath) {
      const resolved = this.resolveFilePath(keyPath);
      if (fs.existsSync(resolved)) {
        const auth = new google.auth.GoogleAuth({
          keyFile: resolved,
          scopes,
        });
        return google.drive({ version: 'v3', auth });
      }
    }

    const jsonContent = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (jsonContent) {
      try {
        const credentials = JSON.parse(jsonContent);
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes,
        });
        return google.drive({ version: 'v3', auth });
      } catch (err: any) {
        throw new Error(`Cấu hình GOOGLE_SERVICE_ACCOUNT_JSON không hợp lệ: ${err.message}`);
      }
    }

    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL;
    let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (clientEmail && privateKey) {
      // Replace escaped newlines if passed in single-line env var
      privateKey = privateKey.replace(/\\n/g, '\n');
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes,
      });
      return google.drive({ version: 'v3', auth });
    }

    throw new Error('Chưa cấu hình thông tin xác thực Google Service Account');
  }

  /**
   * Test connection to Google Drive and verify folder access
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    folderName?: string;
    folderId?: string;
    clientEmail?: string;
  }> {
    const folderId = this.getFolderId();
    if (!folderId) {
      return {
        success: false,
        message: 'Chưa cấu hình GOOGLE_DRIVE_FOLDER_ID',
      };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Chưa cấu hình thông tin xác thực Google Service Account (File JSON hoặc biến môi trường)',
      };
    }

    try {
      const drive = this.getDriveClient();
      const folderRes = await drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType, capabilities',
        supportsAllDrives: true,
      });

      const folderData = folderRes.data;
      if (folderData.mimeType !== 'application/vnd.google-apps.folder') {
        return {
          success: false,
          message: `ID được cấu hình (${folderId}) không phải là thư mục Google Drive (mimeType: ${folderData.mimeType})`,
        };
      }

      const clientEmail = this.getClientEmail() || undefined;

      return {
        success: true,
        message: `Kết nối thành công đến thư mục "${folderData.name}" trên Google Drive`,
        folderName: folderData.name || 'Unnamed Folder',
        folderId,
        clientEmail,
      };
    } catch (err: any) {
      this.logger.error(`Lỗi kiểm tra kết nối Google Drive: ${err.message}`, err.stack);
      let errorDetail = err.message;
      if (err.code === 404) {
        errorDetail = `Không tìm thấy thư mục với ID "${folderId}" hoặc tài khoản Service Account chưa được cấp quyền truy cập (Share) vào thư mục này.`;
      } else if (err.code === 403) {
        errorDetail = `Quyền truy cập bị từ chối: Hãy đảm bảo bạn đã Share thư mục Google Drive cho Service Account với quyền "Editor" / "Người chỉnh sửa".`;
      }

      return {
        success: false,
        message: `Kết nối thất bại: ${errorDetail}`,
        folderId,
        clientEmail: this.getClientEmail() || undefined,
      };
    }
  }

  /**
   * Upload a local backup zip archive to Google Drive
   */
  async uploadFile(
    localFilePath: string,
    fileName: string,
  ): Promise<{ fileId: string; fileName: string; webViewLink?: string; size: number }> {
    const folderId = this.getFolderId();
    if (!folderId) {
      throw new Error('Chưa cấu hình GOOGLE_DRIVE_FOLDER_ID');
    }

    const drive = this.getDriveClient();
    const stat = fs.statSync(localFilePath);
    const fileStream = fs.createReadStream(localFilePath);

    this.logger.log(`Bắt đầu tải lên Google Drive: ${fileName} (${(stat.size / 1024 / 1024).toFixed(2)} MB)...`);

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
   * List all backup files in the Google Drive folder
   */
  async listFiles(): Promise<DriveFileInfo[]> {
    const folderId = this.getFolderId();
    if (!folderId || !this.isConfigured()) return [];

    try {
      const drive = this.getDriveClient();
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
   * Delete a backup file from Google Drive
   */
  async deleteFile(fileId: string): Promise<void> {
    const drive = this.getDriveClient();
    await drive.files.delete({
      fileId,
      supportsAllDrives: true,
    });
    this.logger.log(`Đã xoá file trên Google Drive: ${fileId}`);
  }

  /**
   * Stream a file from Google Drive for client download
   */
  async downloadFileStream(fileId: string): Promise<{
    stream: Readable;
    fileName: string;
    size?: number;
  }> {
    const drive = this.getDriveClient();

    // Get metadata first
    const meta = await drive.files.get({
      fileId,
      fields: 'id, name, size',
      supportsAllDrives: true,
    });

    const fileName = meta.data.name || `backup-${fileId}.zip`;
    const size = meta.data.size ? Number(meta.data.size) : undefined;

    // Get media stream
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
   * Prune older backups on Google Drive, keeping only the latest N files
   */
  async pruneOldBackups(retentionCount: number): Promise<{ deletedCount: number; deletedFiles: string[] }> {
    if (retentionCount <= 0) return { deletedCount: 0, deletedFiles: [] };

    try {
      const files = await this.listFiles();
      // Keep only zip files or files created by backup
      const backupFiles = files.filter((f) => f.name.endsWith('.zip'));

      if (backupFiles.length <= retentionCount) {
        return { deletedCount: 0, deletedFiles: [] };
      }

      const filesToDelete = backupFiles.slice(retentionCount);
      const deletedFiles: string[] = [];

      for (const file of filesToDelete) {
        try {
          await this.deleteFile(file.id);
          deletedFiles.push(file.name);
          this.logger.log(`Tự động dọn dẹp bản backup cũ: ${file.name} (${file.id})`);
        } catch (err: any) {
          this.logger.warn(`Không thể xoá bản backup cũ ${file.name}: ${err.message}`);
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
