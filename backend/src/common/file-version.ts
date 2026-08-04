// Helper xử lý version number trong tên file khi tạo bản sao (NEW_VERSION)

import * as path from 'path';
import * as fs from 'fs';

/**
 * Tìm version tiếp theo cho một đường dẫn file.
 */
export function findNextVersion(filePath: string): number {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  let version = 1;
  while (
    fs.existsSync(path.join(dir, `${baseName}-v${version}${ext}`))
  ) {
    version++;
  }
  return version;
}

/**
 * Sinh đường dẫn file kèm version.
 */
export function getVersionedFilePath(
  basePath: string,
  version?: number,
): string {
  if (!version || version <= 0) return basePath;

  const dir = path.dirname(basePath);
  const ext = path.extname(basePath);
  const baseName = path.basename(basePath, ext);
  return path.join(dir, `${baseName}-v${version}${ext}`);
}

/**
 * Xoá tất cả file có cùng base name (ZIP, XML, PDF) trong cùng thư mục.
 */
export function removeAllRelatedFiles(basePath: string): number {
  const dir = path.dirname(basePath);
  const ext = path.extname(basePath);
  const baseName = path.basename(basePath, ext);
  const extensionsToRemove = ['.zip', '.xml', '.pdf'];
  let removedCount = 0;

  for (const fileExt of extensionsToRemove) {
    const filePath = path.join(dir, `${baseName}${fileExt}`);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        removedCount++;
      }
    } catch {
      // Bỏ qua
    }
  }

  return removedCount;
}

/**
 * Xoá tất cả file version cũ có cùng base name.
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
      const versionedPath = path.join(
        dir,
        `${baseName}-v${version}${fileExt}`,
      );
      if (!fs.existsSync(versionedPath)) break;
      try {
        fs.unlinkSync(versionedPath);
        removedCount++;
      } catch {
        // Bỏ qua
      }
      version++;
    }
  }

  return removedCount;
}
