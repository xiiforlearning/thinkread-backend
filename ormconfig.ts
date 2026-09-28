import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

loadEnv();

const databaseUrl = process.env.DATABASE_URL;
const sslEnabled = ['true', '1'].includes((process.env.DATABASE_SSL ?? '').toLowerCase());

// One-line startup diagnostic so we can see in Railway logs exactly what creds
// the container is parsing from DATABASE_URL. Password is masked to length only.
if (databaseUrl) {
  try {
    const u = new URL(databaseUrl);
    // eslint-disable-next-line no-console
    console.log(
      `[ormconfig] using DATABASE_URL — protocol=${u.protocol} host=${u.hostname} port=${u.port || '(default)'} user=${u.username} db=${u.pathname.replace(/^\//, '')} ssl=${sslEnabled} passLen=${u.password.length}`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`[ormconfig] DATABASE_URL set but failed to parse: ${(err as Error).message}`);
  }
} else {
  // eslint-disable-next-line no-console
  console.log(
    `[ormconfig] DATABASE_URL not set — falling back to DATABASE_HOST=${process.env.DATABASE_HOST ?? '(none)'} DATABASE_USER=${process.env.DATABASE_USER ?? '(none)'} ssl=${sslEnabled}`,
  );
}

const base = {
  type: 'postgres' as const,
  entities: [join(__dirname, 'src', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'src', 'infra', 'db', 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: ['error', 'warn', 'migration'] as ('error' | 'warn' | 'migration')[],
};

const options: DataSourceOptions = databaseUrl
  ? {
      ...base,
      url: databaseUrl,
      ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
    }
  : {
      ...base,
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? '5432'),
      username: process.env.DATABASE_USER ?? 'bot',
      password: process.env.DATABASE_PASSWORD ?? 'bot',
      database: process.env.DATABASE_NAME ?? 'englishbot',
      ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
    };

const dataSource = new DataSource(options);

export default dataSource;
