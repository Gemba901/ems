# Stage 1: Prune the workspace
FROM node:18-alpine AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
# This isolates the web app and its dependencies
RUN turbo prune web --docker


# Stage 2: Install dependencies
FROM node:18-alpine AS installer
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --frozen-lockfile


# Stage 3: Build the project
FROM node:18-alpine AS sourcer
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=installer /app/ .
COPY --from=builder /app/out/full/ .

# Generate Prisma Client (if Next.js uses it directly for server actions/API routes)
RUN pnpm dlx prisma generate --schema=packages/db/prisma/schema.prisma

# Build the Next.js frontend
RUN pnpm turbo run build --filter=web...


# Stage 4: Production Runner
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV production

# Secure the container
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone output and static files
COPY --from=sourcer /app/apps/web/public ./apps/web/public
COPY --from=sourcer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=sourcer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000
# set hostname to localhost
ENV HOSTNAME "0.0.0.0"

# Start the standalone Next.js server
CMD ["node", "apps/web/server.js"]