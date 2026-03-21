FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY patches ./patches
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages ./packages
RUN corepack enable && pnpm install --filter @opensocial/admin... --frozen-lockfile=false

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app /app
COPY . .
RUN corepack enable && pnpm --filter @opensocial/admin exec next build --webpack

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3001
CMD ["sh", "-lc", "cd apps/admin && node_modules/.bin/next start -p 3001 -H 0.0.0.0"]
