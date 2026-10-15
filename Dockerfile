# ---- 1) build the React app ----
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY frontend/ ./
RUN npm run build

# ---- 2) API + static frontend in one small image ----
FROM node:22-alpine
ENV NODE_ENV=production SERVE_FRONTEND=true
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && (if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi) && npm cache clean --force
COPY backend/ backend/
COPY database/ database/
COPY --from=web /web/dist frontend/dist
RUN chown -R node:node /app
USER node
WORKDIR /app/backend
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:${PORT:-5000}/api/health || exit 1
# Applies pending DB migrations, then starts the server (PID 1 gets SIGTERM for graceful shutdown).
CMD ["sh", "-c", "node src/scripts/migrate.js && exec node src/server.js"]
