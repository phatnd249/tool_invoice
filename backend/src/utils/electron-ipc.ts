interface PendingRequest {
  resolve: () => void;
  reject: (err: any) => void;
}

const pdfRequests = new Map<string, PendingRequest>();
let requestIdCounter = 0;

/**
 * Xử lý thông điệp nhận được từ tiến trình chính Electron.
 */
export function handleElectronIpcMessage(message: any): void {
  if (message && message.type === 'GENERATE_PDF_RESPONSE') {
    const { requestId, success, error } = message;
    const pending = pdfRequests.get(requestId);
    if (pending) {
      pdfRequests.delete(requestId);
      if (success) {
        pending.resolve();
      } else {
        pending.reject(new Error(error || 'Lỗi tạo PDF từ phía Electron.'));
      }
    }
  }
}

/**
 * Gửi yêu cầu chuyển đổi HTML sang PDF tới tiến trình chính Electron qua kênh IPC.
 */
export function generatePdfViaElectron(htmlPath: string, pdfPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!process.send) {
      return reject(new Error('Tiến trình không chạy trong môi trường Electron (process.send không khả dụng).'));
    }

    const requestId = String(++requestIdCounter);

    // Thiết lập timeout 15 giây để tránh tắc nghẽn luồng tải hóa đơn
    const timeout = setTimeout(() => {
      if (pdfRequests.has(requestId)) {
        pdfRequests.delete(requestId);
        reject(new Error(`Yêu cầu tạo PDF bị hết hạn (timeout) sau 15 giây.`));
      }
    }, 15000);

    pdfRequests.set(requestId, {
      resolve: () => {
        clearTimeout(timeout);
        resolve();
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });

    process.send({
      type: 'GENERATE_PDF_REQUEST',
      requestId,
      htmlPath,
      pdfPath
    });
  });
}
