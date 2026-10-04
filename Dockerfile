# SpineSurge — single-container deployment (web app + API on one port).
# Used for the hosted demo (docs/DEPLOYMENT.md). Postgres is external (managed),
# uploads live on a mounted disk (UPLOADS_DIR).

# ── 1. Build the web app ─────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Optional: pre-fill the shared demo login on the sign-in page.
ARG VITE_DEMO_EMAIL=""
ARG VITE_DEMO_PASSWORD=""
ENV VITE_DEMO_EMAIL=$VITE_DEMO_EMAIL VITE_DEMO_PASSWORD=$VITE_DEMO_PASSWORD
RUN npx vite build

# ── 2. Runtime ───────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    SERVE_CLIENT=true \
    PORT=3001 \
    UPLOADS_DIR=/data/uploads \
    PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
# tsx, pg and drizzle-orm are devDependencies but the server needs them at runtime.
# NODE_ENV=production (above) would make npm skip them — include them explicitly.
RUN npm ci --include=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
RUN mkdir -p /data/uploads
EXPOSE 3001
# Migrate → (only if a shared demo login is configured) seed it → start.
# Testers normally create their own accounts (DEMO_MODE=true skips the email code).
CMD ["sh", "-c", "npx --no-install tsx server/migrate.ts && if [ \"$DEMO_MODE\" = \"true\" ] && [ -n \"$DEMO_USER_EMAIL\" ]; then npx --no-install tsx server/seed-dev-user.ts; fi && npx --no-install tsx server/index.ts"]
