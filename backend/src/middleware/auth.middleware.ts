import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'invoice_downloader_secret_key_12984712';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

/**
 * Kiểm tra và giải mã token, trả về payload nếu hợp lệ.
 * Dùng cho các trường hợp tự xác thực (SSE endpoint không qua middleware).
 */
export function verifyToken(token: string): { id: number; username: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return null;
  }
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const queryToken = req.query.token as string | undefined;
  const token = (authHeader && authHeader.split(' ')[1]) || queryToken;

  if (!token) {
    res.status(401).json({ error: 'Truy cập bị từ chối. Vui lòng đăng nhập.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
    };
    next();
  } catch (error) {
    res.status(403).json({ error: 'Phiên làm việc hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.', code: 'TOKEN_EXPIRED' });
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này.' });
      return;
    }

    next();
  };
}
