
# Stage 1: Prune the workspace
FROM node:18-alpine AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
# This isolates the API and its local dependencies (packages/db)
RUN turbo prune api --docker


# Stage 2: Install dependencies
FROM node:18-alpine AS installer
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

# Install dependencies based on the pruned lockfile
RUN pnpm install --frozen-lockfile


# Stage 3: Build the project
FROM node:18-alpine AS sourcer
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=installer /app/ .
COPY --from=builder /app/out/full/ .

# Generate the Prisma Client using your custom output path
RUN pnpm dlx prisma generate --schema=packages/db/prisma/schema.prisma

# Build the NestJS API
RUN pnpm turbo run build --filter=api...


# Stage 4: Production Runner
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV production

# Secure the container by not running as root
RUN addgroup --system --gid 1001 nestjs
RUN adduser --system --uid 1001 nestjs
USER nestjs

# Copy only the compiled assets, node_modules, and Prisma client
COPY --from=sourcer --chown=nestjs:nestjs /app/node_modules ./node_modules
COPY --from=sourcer --chown=nestjs:nestjs /app/apps/api/dist ./apps/api/dist
COPY --from=sourcer --chown=nestjs:nestjs /app/packages/db/generated ./packages/db/generated
COPY --from=sourcer --chown=nestjs:nestjs /app/packages/db/package.json ./packages/db/package.json

EXPOSE 3001
ENV PORT 3001

# Start the NestJS application
CMD ["node", "apps/api/dist/main.js"]