import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';

async function bootstrap() {
  // rawBody: necesario para verificar firmas HMAC de webhooks (N1CO)
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigin = process.env.FRONTEND_URL ?? '*';

  app.enableCors({
    origin: (origin, callback) => {
      // Sin origen (curl, Postman, SSR) → OK
      if (!origin) return callback(null, true);
      // Extensiones Chrome/Edge → siempre OK (la clave valida el acceso)
      if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
        return callback(null, true);
      }
      // En dev → cualquier origen
      if (!isProd) return callback(null, true);
      // En producción → solo el frontend autorizado
      if (origin === allowedOrigin) return callback(null, true);
      return callback(new Error(`CORS: origen no permitido: ${origin}`));
    },
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
