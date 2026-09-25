import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MailService } from '../mail/mail.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { RateLimit } from '../common/rate-limit.guard';
import type { Request } from 'express';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly mailService: MailService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @RateLimit({ limit: 5, windowMs: 15 * 60 * 1000, keyPrefix: 'feedback' })
  async create(@Req() req: Request, @Body() dto: CreateFeedbackDto) {
    const user = req.user as { fullName: string; email: string };

    await this.mailService.sendFeedback({
      fromName: user.fullName,
      fromEmail: user.email,
      title: dto.title,
      content: dto.content,
      category: dto.category,
    });

    return { message: 'Cảm ơn bạn đã gửi phản hồi!' };
  }
}
