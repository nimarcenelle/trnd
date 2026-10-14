# TRND scraper worker: Chrome + Playwright, matching playwright-core in package.json.
FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY lib ./lib
COPY worker ./worker

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["pnpm", "worker"]
