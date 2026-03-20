FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/mobile/package.json ./apps/mobile/package.json
RUN corepack enable && pnpm install --filter @opensocial/mobile... --frozen-lockfile=false
COPY apps/mobile ./apps/mobile
CMD ["pnpm", "--filter", "@opensocial/mobile", "dev"]
