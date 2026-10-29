# Build stage: dev dependencies (esbuild) are only needed to bundle the dashboard.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:web

# Runtime stage: production dependencies only, so the final image stays small.
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
COPY --from=build /app/public ./public

# Local JSON storage is written here when DATABASE_URL is not set.
RUN mkdir -p data && chown node:node data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# Run node directly (not npm) so SIGTERM reaches the app and it can shut down cleanly.
CMD ["node", "--import", "tsx", "src/index.ts"]
