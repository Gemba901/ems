import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { requestLogging } from './operations/request-logging';
import { SafeExceptionFilter } from './operations/safe-exception.filter';
import { validateEnv } from './config/validate-env';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const problems = validateEnv();
  if (problems.length) throw new Error(`Invalid environment:\n- ${problems.join('\n- ')}`);

  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(requestLogging);
  app.use(cookieParser());

  // Browsers reach the API only through the same-origin Next.js proxy, which
  // calls it server-to-server, so CORS stays off unless explicitly configured.
  if (process.env.CORS_ORIGINS) {
    app.enableCors({
      origin: process.env.CORS_ORIGINS.split(',').map((o) => o.trim()),
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,
      allowedHeaders: 'Content-Type, Accept, Authorization',
    });
  }
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
  }));
  app.useGlobalFilters(new SafeExceptionFilter());

  await app.listen(process.env.PORT ?? 5001);
}
bootstrap();
