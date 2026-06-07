# SpineSurge frontend — build the Vite SPA, serve it with nginx.
# The cornerstone/VTK pipeline requires cross-origin isolation (SharedArrayBuffer + WASM workers),
# so nginx must emit the same COOP/COEP headers the Vite dev server does (see vite.config.ts).

# ── build ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# VITE_API_URL is baked at build time (Vite inlines import.meta.env). Defaults to the api service
# published on the host at :8000 — the browser, not the container, makes these calls.
ARG VITE_API_URL=http://localhost:8000/api/v1
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── serve ──────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
# 127.0.0.1 (not localhost): nginx binds IPv4 and busybox wget would try ::1 first.
HEALTHCHECK --interval=10s --timeout=3s --retries=10 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
