import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { requestLogging } from './operations/request-logging';
import { SafeExceptionFilter } from './operations/safe-exception.filter';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(requestLogging);
  app.use(cookieParser());

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['https://ems-web-swart.vercel.app', 'https://ems.gembapms.co.in', 'http://localhost:3000', 'https://bees.gembapms.com'];

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
  }));
  app.useGlobalFilters(new SafeExceptionFilter());

  await app.listen(process.env.PORT ?? 5001);
}
bootstrap();
