import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();

  // Swagger for the REST API used by the Mini App and the web dashboard.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ThinkRead API')
    .setDescription('REST API for the ThinkRead Telegram Mini App and admin dashboard.')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  const polling = app.get(AppConfigService).botLaunch
    ? 'polling'
    : 'polling disabled (BOT_LAUNCH=false)';
  logger.log(`Bot started, ${polling}. HTTP + Swagger on :${port}/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap app', err);
  process.exit(1);
});
