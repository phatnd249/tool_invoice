import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { vietnameseValidationFactory } from './common/validation-messages';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.getHttpAdapter().getInstance().disable('x-powered-by');

  app.setGlobalPrefix('api');

  app.use((req, res, next) => {
    if (!res.headersSent) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Frame-Options', 'DENY');
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: vietnameseValidationFactory,
    }),
  );

  app.enableCors({
    origin: (origin, callback) => {
      // Cho phép request cùng nguồn (same-origin), mobile app hoặc không có header Origin
      if (!origin) return callback(null, true);

      const configuredOrigins = process.env.APP_URL
        ? process.env.APP_URL.split(',').map((u) => u.trim())
        : [];

      if (configuredOrigins.includes('*') || configuredOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Tự động cho phép localhost và các dải IP mạng nội bộ (LAN / Wi-Fi / VPN)
      if (
        /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|26\.\d+\.\d+\.\d+)(:\d+)?$/.test(
          origin,
        )
      ) {
        return callback(null, true);
      }

      return callback(null, true);
    },
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
