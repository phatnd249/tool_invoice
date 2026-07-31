import { Module } from '@nestjs/common';
import { GeminiClientService } from './gemini-client.service';
import { CaptchaResolverService } from './captcha-resolver.service';
import { GdtAuthService } from './gdt-auth.service';

@Module({
  providers: [GeminiClientService, CaptchaResolverService, GdtAuthService],
  exports: [GeminiClientService, CaptchaResolverService, GdtAuthService],
})
export class AiModule {}
