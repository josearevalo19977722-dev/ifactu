import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigin = process.env.FRONTEND_URL ?? '*';

  app.enableCors({
    // En producción, solo el dominio del frontend. En dev, cualquier origen.
    origin: isProd ? allowedOrigin : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization', 'Accept'],
    credentials: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  // Crear usuario admin inicial si no hay ninguno
  const authService = app.get(AuthService);
  await authService.initAdmin();

  // 3002 por defecto: en muchos equipos Nexa u otros servicios ya usan :3000
  const port = process.env.PORT ?? 3002;
  await app.listen(port, '0.0.0.0');
  console.log(`Backend corriendo en http://localhost:${port}/api`);
}
bootstrap();
