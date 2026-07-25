import { Response } from 'express';
import prisma from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { sendFeedbackNotification } from '../services/mail.service.js';

export class FeedbackController {
  /**
   * POST /api/feedbacks
   * Submit a new feedback (Available to all logged-in users)
   */
  public static async submitFeedback(req: AuthRequest, res: Response): Promise<void> {
    const { content } = req.body;

    if (!content || !content.trim()) {
      res.status(400).json({ error: 'Nội dung góp ý không được để trống.' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    try {
      const feedback = await prisma.feedback.create({
        data: {
          content: content.trim(),
          userId: req.user.id,
          status: 'PENDING',
        },
        include: {
          user: {
            select: {
              username: true,
            },
          },
        },
      });

      // Gửi email thông báo cho team dev (async, không block response)
      sendFeedbackNotification(feedback.content, {
        id: feedback.userId,
        username: feedback.user.username,
      });

      res.status(201).json(feedback);
    } catch (error: any) {
      console.error('[FeedbackController] Submit feedback error:', error);
      res.status(500).json({ error: 'Không thể gửi ý kiến góp ý.' });
    }
  }

  /**
   * GET /api/feedbacks/my
   * Get feedbacks of the current user (Available to all logged-in users)
   */
  public static async getMyFeedbacks(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    try {
      const feedbacks = await prisma.feedback.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
      });

      res.json(feedbacks);
    } catch (error: any) {
      console.error('[FeedbackController] Get my feedbacks error:', error);
      res.status(500).json({ error: 'Không thể lấy danh sách góp ý.' });
    }
  }

  /**
   * GET /api/feedbacks
   * Get all feedbacks list (Restricted to ADMIN)
   */
  public static async getFeedbacks(req: AuthRequest, res: Response): Promise<void> {
    try {
      const feedbacks = await prisma.feedback.findMany({
        include: {
          user: {
            select: {
              username: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      res.json(feedbacks);
    } catch (error: any) {
      console.error('[FeedbackController] Get feedbacks error:', error);
      res.status(500).json({ error: 'Không thể lấy danh sách góp ý.' });
    }
  }

  /**
   * PUT /api/feedbacks/:id
   * Update feedback status (RESOLVED/REJECTED) (Restricted to ADMIN)
   */
  public static async updateFeedbackStatus(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['PENDING', 'RESOLVED', 'REJECTED'].includes(status)) {
      res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
      return;
    }

    try {
      const feedback = await prisma.feedback.findUnique({
        where: { id: Number(id) },
      });

      if (!feedback) {
        res.status(404).json({ error: 'Không tìm thấy ý kiến đóng góp.' });
        return;
      }

      await prisma.feedback.update({
        where: { id: feedback.id },
        data: { status },
      });

      res.json({ message: 'Cập nhật trạng thái đóng góp thành công.' });
    } catch (error: any) {
      console.error('[FeedbackController] Update feedback status error:', error);
      res.status(500).json({ error: 'Không thể cập nhật trạng thái đóng góp.' });
    }
  }
}
