import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: true, rawBody: true });
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN', 'http://localhost:3000'),
    credentials: true,
  });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(cookieParser());
  app.use((_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
  // Freio por IP nas rotas sensíveis (além do bloqueio por conta): tentativa de força bruta e abuso de e-mail.
  const strict = (windowMs: number, limit: number) => rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { statusCode: 429, message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' } });
  app.use('/api/v1/auth/login', strict(15 * 60_000, 30));
  app.use('/api/v1/auth/registrar', strict(60 * 60_000, 20));
  app.use('/api/v1/auth/esqueci-senha', strict(60 * 60_000, 10));
  app.use('/api/v1/auth/redefinir-senha', strict(60 * 60_000, 20));
  app.use('/api/v1/auth/2fa', strict(15 * 60_000, 30));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true }, forbidNonWhitelisted: true }));
  await app.listen(config.get<number>('PORT', 3001), '0.0.0.0');
}

void bootstrap();
