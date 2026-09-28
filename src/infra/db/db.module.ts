import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';
import { AppConfigModule } from '../../config/config.module';
import { AppConfigService } from '../../config/config.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): TypeOrmModuleOptions => {
        const common: Partial<TypeOrmModuleOptions> = {
          type: 'postgres',
          entities: [join(__dirname, '..', '..', '**', '*.entity.{ts,js}')],
          migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
          migrationsRun: false,
          synchronize: false,
          logging: config.isProduction ? ['error', 'warn'] : ['error', 'warn', 'migration'],
        };

        if (config.databaseUrl) {
          return {
            ...common,
            url: config.databaseUrl,
            ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
          } as TypeOrmModuleOptions;
        }

        return {
          ...common,
          host: config.databaseHost,
          port: config.databasePort,
          username: config.databaseUser,
          password: config.databasePassword,
          database: config.databaseName,
          ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
        } as TypeOrmModuleOptions;
      },
    }),
  ],
})
export class DatabaseModule {}
