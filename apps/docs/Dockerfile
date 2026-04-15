FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/docs/package.json apps/docs/package.json

RUN pnpm install --filter @opensocial/docs... --frozen-lockfile=false

COPY . .

RUN pnpm --filter @opensocial/docs build

FROM nginx:1.27-alpine AS runtime

COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/docs/build /usr/share/nginx/html

EXPOSE 3003
