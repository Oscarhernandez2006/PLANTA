# Imagen de la API (NestJS + Prisma) para Dokploy.
# Contexto de build: raíz del monorepo  ->  docker build -f apps/api/Dockerfile .
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9.15.9

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/

# Solo la API y sus dependencias de workspace (evita descargar Electron, Vite, etc.).
RUN pnpm install --frozen-lockfile --filter "@frigorifico/api..."

COPY packages/database packages/database
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @frigorifico/database generate \
  && pnpm --filter @frigorifico/api build

ENV NODE_ENV=production
ENV API_PORT=3000
EXPOSE 3000

WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
