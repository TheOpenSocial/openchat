FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages ./packages
RUN corepack enable && pnpm install --filter @opensocial/admin... --frozen-lockfile=false

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app /app
COPY . .
RUN corepack enable && pnpm --filter @opensocial/admin build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/admin/.next ./.next
COPY --from=build /app/apps/admin/public ./public
COPY --from=build /app/apps/admin/package.json ./package.json
CMD ["node_modules/.bin/next", "start", "-p", "3001"]
