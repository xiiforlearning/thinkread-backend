import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();

  // Swagger for the /tools demo/ops endpoints.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('English Helper Bot — Tools')
    .setDescription('On-demand endpoints to drive bot flows and seed demo data. Guard with TOOLS_KEY.')
    .setVersion('2.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Bot started, polling. HTTP + Swagger on :${port}/docs`);
  if (!process.env.TOOLS_KEY) {
    logger.warn('TOOLS_KEY is not set — /tools endpoints are OPEN. Set TOOLS_KEY to protect them.');
  }
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap app', err);
  process.exit(1);
});
