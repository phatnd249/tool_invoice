// backend/src/utils/file-version.ts
// Helper xử lý version number trong tên file khi tạo bản sao (NEW_VERSION)

import * as path from 'path';
import * as fs from 'fs';

/**
 * Tìm version tiếp theo cho một đường dẫn file.
 * Kiểm tra lần lượt {baseName}-v1{ext}, {baseName}-v2{ext}, ...
 * Trả về version đầu tiên chưa tồn tại (bắt đầu từ 1).
 *
 * @example
 *   findNextVersion('/dir/file.zip') → 1 nếu file-v1.zip chưa tồn tại
 *   findNextVersion('/dir/file.zip') → 3 nếu file-v1.zip và file-v2.zip đã tồn tại
 */
export function findNextVersion(filePath: string): number {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  let version = 1;
  while (fs.existsSync(path.join(dir, `${baseName}-v${version}${ext}`))) {
    version++;
  }
  return version;
}

/**
 * Sinh đường dẫn file kèm version.
 *
 * @param basePath - Đường dẫn gốc (vd: /dir/file.zip)
 * @param version - Số phiên bản (nếu <= 0 hoặc undefined thì trả về basePath)
 * @returns Đường dẫn có version (vd: /dir/file-v1.zip)
 */
export function getVersionedFilePath(basePath: string, version?: number): string {
  if (!version || version <= 0) return basePath;

  const dir = path.dirname(basePath);
  const ext = path.extname(basePath);
  const baseName = path.basename(basePath, ext);
  return path.join(dir, `${baseName}-v${version}${ext}`);
}

/**
 * Xoá tất cả file có cùng base name (ZIP, XML, PDF) trong cùng thư mục.
 * Dùng khi overwrite để dọn dẹp file cũ trước khi tải mới.
 *
 * @param basePath - Đường dẫn file làm gốc (vd: /dir/taxCode-invNum-K.zip)
 * @returns Số lượng file đã xoá
 */
export function removeAllRelatedFiles(basePath: string): number {
  const dir = path.dirname(basePath);
  const ext = path.extname(basePath);
  const baseName = path.basename(basePath, ext);
  const extensionsToRemove = ['.zip', '.xml', '.pdf'];
  let removedCount = 0;

  for (const ext of extensionsToRemove) {
    const filePath = path.join(dir, `${baseName}${ext}`);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        removedCount++;
      }
    } catch {
      // Bỏ qua lỗi, file có thể đang được dùng
    }
  }

  return removedCount;
}

/**
 * Xoá tất cả file version cũ có cùng base name (v1, v2, ...).
 * Dùng trước khi ghi đè với version number.
 *
 * @param basePath - Đường dẫn gốc
 * @param excludeVersion - Version không xoá (nếu có)
 * @returns Số lượng file đã xoá
 */
export function removeAllVersionedFiles(
  basePath: string,
  excludeVersion?: number,
): number {
  const dir = path.dirname(basePath);
  const ext = path.extname(basePath);
  const baseName = path.basename(basePath, ext);
  const extensionsToRemove = ['.zip', '.xml', '.pdf'];
  let removedCount = 0;

  for (const fileExt of extensionsToRemove) {
    let version = 1;
    while (true) {
      if (excludeVersion && version === excludeVersion) {
        version++;
        continue;
      }
      const versionedPath = path.join(dir, `${baseName}-v${version}${fileExt}`);
      if (!fs.existsSync(versionedPath)) break;
      try {
        fs.unlinkSync(versionedPath);
        removedCount++;
      } catch {
        // Bỏ qua lỗi
      }
      version++;
    }
  }

  return removedCount;
}
