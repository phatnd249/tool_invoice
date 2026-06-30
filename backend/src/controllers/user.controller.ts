import { Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.middleware.js';

export class UserController {
  /**
   * GET /api/users
   */
  public static async getUsers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          isActive: true,
          createdAt: true,
          companies: {
            select: {
              companyId: true,
              company: {
                select: {
                  name: true,
                  taxCode: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(users);
    } catch (error: any) {
      console.error('[UserController] Fetch users error:', error);
      res.status(500).json({ error: 'Không thể tải danh sách người dùng.' });
    }
  }

  /**
   * POST /api/users
   */
  public static async createUser(req: AuthRequest, res: Response): Promise<void> {
    const { username, password, role = 'STAFF', isActive = true, companyIds = [] } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Tên đăng nhập và mật khẩu là bắt buộc.' });
      return;
    }

    try {
      const existing = await prisma.user.findUnique({
        where: { username: username.trim() }
      });
      if (existing) {
        res.status(400).json({ error: 'Tên đăng nhập đã tồn tại.' });
        return;
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          username: username.trim(),
          password: hashedPassword,
          role,
          isActive,
          companies: {
            create: companyIds.map((cid: number) => ({
              companyId: cid
            }))
          }
        },
        select: {
          id: true,
          username: true,
          role: true,
          isActive: true
        }
      });

      res.status(201).json(user);
    } catch (error: any) {
      console.error('[UserController] Create user error:', error);
      res.status(500).json({ error: 'Không thể tạo tài khoản người dùng.' });
    }
  }

  /**
   * PUT /api/users/:id
   */
  public static async updateUser(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { username, password, role, isActive, companyIds } = req.body;

    try {
      const targetUser = await prisma.user.findUnique({
        where: { id: Number(id) }
      });

      if (!targetUser) {
        res.status(404).json({ error: 'Không tìm thấy người dùng.' });
        return;
      }

      const updateData: any = {};

      if (username) {
        // Check if username is already taken by someone else
        const dupe = await prisma.user.findFirst({
          where: {
            username: username.trim(),
            NOT: { id: targetUser.id }
          }
        });
        if (dupe) {
          res.status(400).json({ error: 'Tên đăng nhập đã tồn tại ở tài khoản khác.' });
          return;
        }
        updateData.username = username.trim();
      }

      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      if (role) {
        // Prevent administrative self-downgrading
        if (targetUser.id === req.user?.id && role !== 'ADMIN') {
          res.status(400).json({ error: 'Bạn không được phép hạ quyền quản trị của chính mình.' });
          return;
        }
        updateData.role = role;
      }

      if (isActive !== undefined) {
        // Prevent self-locking
        if (targetUser.id === req.user?.id && !isActive) {
          res.status(400).json({ error: 'Bạn không được tự khóa tài khoản của chính mình.' });
          return;
        }
        updateData.isActive = isActive;
      }

      // Update basic fields
      await prisma.user.update({
        where: { id: targetUser.id },
        data: updateData
      });

      // Update company assignments if provided
      if (companyIds !== undefined) {
        await prisma.$transaction([
          prisma.userCompany.deleteMany({
            where: { userId: targetUser.id }
          }),
          prisma.userCompany.createMany({
            data: companyIds.map((cid: number) => ({
              userId: targetUser.id,
              companyId: cid
            }))
          })
        ]);
      }

      res.json({ message: 'Cập nhật người dùng thành công.' });
    } catch (error: any) {
      console.error('[UserController] Update user error:', error);
      res.status(500).json({ error: 'Không thể cập nhật thông tin người dùng.' });
    }
  }

  /**
   * DELETE /api/users/:id
   */
  public static async deleteUser(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    try {
      const targetUser = await prisma.user.findUnique({
        where: { id: Number(id) }
      });

      if (!targetUser) {
        res.status(404).json({ error: 'Không tìm thấy người dùng.' });
        return;
      }

      // Prevent self-deletion
      if (targetUser.id === req.user?.id) {
        res.status(400).json({ error: 'Bạn không được phép xóa tài khoản của chính mình.' });
        return;
      }

      await prisma.user.delete({
        where: { id: targetUser.id }
      });

      res.json({ message: 'Xóa tài khoản người dùng thành công.' });
    } catch (error: any) {
      console.error('[UserController] Delete user error:', error);
      res.status(500).json({ error: 'Không thể xóa tài khoản người dùng.' });
    }
  }
}
