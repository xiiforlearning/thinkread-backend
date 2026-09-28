FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

# Dependencies (cached layer)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Source + config
COPY tsconfig.json tsconfig.build.json nest-cli.json ormconfig.ts ./
COPY src ./src
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Compile TS → dist/
RUN pnpm build

# docker-entrypoint.sh runs migrations then start:dev or start:prod based on NODE_ENV.
ENTRYPOINT ["./docker-entrypoint.sh"]
