import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { ApiExceptionFilter, DataEnvelopeInterceptor } from './infra/api/common/http';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();

  const config = app.get(AppConfigService);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new DataEnvelopeInterceptor());
  const origins = config.corsOrigins;
  if (origins.length > 0) app.enableCors({ origin: origins, credentials: true });

  // Swagger for the REST API used by the Mini App and the web dashboard.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ThinkRead API')
    .setDescription('REST API for the ThinkRead Telegram Mini App and admin dashboard.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  const polling = config.botLaunch ? 'polling' : 'polling disabled (BOT_LAUNCH=false)';
  logger.log(`Bot started, ${polling}. HTTP + Swagger on :${port}/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap app', err);
  process.exit(1);
});
