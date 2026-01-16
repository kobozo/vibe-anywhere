# Vibe Anywhere - Production Dockerfile
# Multi-stage build for optimized image size

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:22-alpine AS deps

WORKDIR /app

# Install build dependencies for native modules (bcrypt, ssh2)
RUN apk add --no-cache python3 make g++ linux-headers

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev for build)
RUN npm ci

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set production environment for build optimization
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Provide dummy DATABASE_URL for build (required for Next.js page data collection)
# Actual DATABASE_URL will be provided at runtime via docker-compose
ARG DATABASE_URL=postgresql://buildtime:buildtime@localhost:5432/buildtime
ENV DATABASE_URL=$DATABASE_URL

# Build Next.js application
RUN npm run build

# =============================================================================
# Stage 3: Production Runner
# =============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    git \
    openssh-client \
    docker-cli \
    rsync \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 vibeanywhere

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
# Copy migration files
COPY --from=builder /app/drizzle ./drizzle

# Docker support removed - this is now Proxmox-only
# COPY --from=builder /app/docker ./docker

# Create directories for runtime
RUN mkdir -p /app/logs \
    && chown -R vibeanywhere:nodejs /app

# Switch to non-root user
USER vibeanywhere

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application
CMD ["npm", "run", "start"]
