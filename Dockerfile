FROM node:22-alpine AS base

# Install build dependencies for better-sqlite3
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- Builder ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# ---- Runner ----
FROM node:22-alpine AS runner
# tzdata: lets TZ (docker-compose) and Intl resolve real time zones, so
# backups, reminders and the nightly sync follow local time.
RUN apk add --no-cache libc6-compat su-exec tzdata

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATA_DIR=/app/data

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Copy native modules (better-sqlite3)
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Data dir (SQLite DB, daily backups in /app/data/backups, recipe image cache in
# /app/data/cache/images). The entrypoint
# re-runs chown at startup so a bind-mounted volume is writable by nextjs too.
RUN mkdir -p /app/data/backups && chown -R nextjs:nodejs /app/data

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
