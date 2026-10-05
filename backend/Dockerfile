FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY scripts ./scripts
COPY sql/002_evidence_assets.sql ./sql/002_evidence_assets.sql
COPY sql/007_work_package_versions.sql ./sql/007_work_package_versions.sql
COPY sql/008_reconnection_schema.sql ./sql/008_reconnection_schema.sql
EXPOSE 8080
CMD ["sh", "-c", "node scripts/apply-startup-schema-migrations.mjs && node migrations/20260923-load-excel-20260922.mjs && node dist/src/server.js"]
