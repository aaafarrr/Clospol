# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++ gcc
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time environment variables
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

# Build Next.js application
RUN npm run build

# Stage 3: Run the application
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Install system dependencies:
# - ffmpeg: Required for CCTV streams transcode orchestration
# - libc6-compat: Required for potential glibc compatibility (like node native addons)
RUN apk add --no-cache ffmpeg libc6-compat

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application and required configuration
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/db ./src/db
COPY --from=builder /app/entrypoint.sh ./entrypoint.sh

# Create persistent storage directories and set ownership
RUN mkdir -p /app/storage /app/public/streams
RUN chmod +x /app/entrypoint.sh
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Use custom entrypoint to auto-migrate database schema on container boot
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["npm", "run", "start"]
