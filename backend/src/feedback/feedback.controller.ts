import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MailService } from '../mail/mail.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import type { Request } from 'express';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly mailService: MailService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
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
