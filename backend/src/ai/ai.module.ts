import { Module } from '@nestjs/common';
import { GeminiClientService } from './gemini-client.service';
import { CaptchaResolverService } from './captcha-resolver.service';

@Module({
  providers: [GeminiClientService, CaptchaResolverService],
  exports: [GeminiClientService, CaptchaResolverService],
})
export class AiModule {}
