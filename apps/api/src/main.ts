import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DecimalComaPipe } from './common/decimal-coma.pipe';
import { MayusculasPipe } from './common/mayusculas.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // Validación estricta en todos los endpoints (capa 1 de 3: DTO).
  // Antes de validar, los decimales con coma ("12,5") pasan a punto ("12.5").
  // Después de validar, el texto libre pasa a MAYÚSCULA.
  app.useGlobalPipes(
    new DecimalComaPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
    new MayusculasPipe(),
  );

  // CORS_ORIGIN: lista separada por comas de orígenes permitidos. Si no se
  // define, se acepta cualquier origen (la app de escritorio carga desde
  // file:// y envía Origin "null").
  const corsOrigin = config
    .get<string>('CORS_ORIGIN')
    ?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigin?.length ? corsOrigin : true,
    credentials: true,
  });

  const port = config.get<number>('API_PORT') ?? 3000;
  await app.listen(port);
  console.log(`API escuchando en http://localhost:${port}/api`);
}

void bootstrap();
