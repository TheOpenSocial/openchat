FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages ./packages
RUN corepack enable && pnpm install --filter @opensocial/web... --frozen-lockfile=false

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app /app
COPY . .
RUN corepack enable && pnpm --filter @opensocial/types build && pnpm --filter @opensocial/web exec next build --webpack

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3002
CMD ["sh", "-lc", "cd apps/web && node ../../node_modules/next/dist/bin/next start -p 3002"]
