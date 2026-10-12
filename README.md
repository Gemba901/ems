# EMS System Monorepo

This is the Employee Management System (EMS) built using a modern monorepo architecture powered by Turborepo.

## Company onboarding and tenancy

See the [architecture and implementation guide](infra/company-onboarding/README.md),
[operations runbook](infra/company-onboarding/operations.md),
[scaling roadmap](infra/company-onboarding/scaling.md), and
[file inventory](infra/company-onboarding/file-inventory.md).
These distinguish the working staging setup from outstanding production gates.

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js + Tailwind CSS + shadcn/ui |
| Backend | NestJS |
| Database | PostgreSQL |
| ORM | Prisma |
| Monorepo | Turborepo |
| Package Manager | pnpm |
| Containerization | Docker (backend) |

---

## 📁 Project Structure

```
apps/
├── web/        → Next.js frontend
└── api/        → NestJS backend

packages/
└── db/         → Prisma schema and database client
```

---

## ⚙️ Getting Started

### 1. Install Dependencies

```sh
pnpm install
```

### 2. Setup Environment Variables

Create `.env` files in the following locations:

```
apps/web/.env.local
apps/api/.env
packages/db/.env
```

Example:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/ems_db
JWT_SECRET=your_secret
```

### 3. Setup Database (Prisma)

```sh
cd packages/db
npx prisma migrate dev
npx prisma generate
```

### 4. Run the Development Environment

From the root:

```sh
pnpm dev
```

This will start:
- ⚡ Frontend (Next.js)
- 🔧 Backend (NestJS)

---

## 🏗️ Build

To build all applications:

```sh
pnpm build
```

---

## 🐳 Local development with Docker Compose

Runs Postgres, the API and the web app with hot reload; no local Node or Postgres needed.
Only Docker is required — clone and run:

```sh
docker compose up        # http://localhost:3000 (web), :5000 (API), Postgres on :5433
```

Log in at http://localhost:3000 with `admin@gemba.local` / `Admin@12345` (local only).

- The first run installs dependencies, builds `packages/db`, applies all migrations and seeds the `gemba-pms` workspace with one SUPER_ADMIN (`packages/db/prisma/dev-seed.sql`; skipped if the database already has data). Expect several minutes and ~4 GB of RAM.
- Settings come from `apps/api/.env.example` and `apps/web/.env.example`. Your own `apps/api/.env` / `apps/web/.env.local`, if present, override them — add AWS/SES/Anthropic keys there to enable uploads, email and the AI assistant. Compose always overrides `DATABASE_URL`, so containers never touch RDS.
- Linux users whose `id -u` is not 1000: `printf "DEV_UID=$(id -u)\nDEV_GID=$(id -g)\n" > .env && docker compose build`.
- Keep your existing local data: `pg_dump -Fc -h localhost -U <user> <db> | docker compose exec -T postgres pg_restore -U gemba -d gemba_dev --clean --if-exists --no-owner`, then `docker compose run --rm setup`.
- After changing `pnpm-lock.yaml` or adding a migration: `docker compose run --rm setup`
- Reset everything (database included): `docker compose down -v`

## 🐳 Docker (Backend)

Build the backend container:

```sh
docker build -t ems-api ./apps/api
```

Run the container:

```sh
docker run -p 4000:4000 ems-api
```

---

## 🌿 Branching Strategy

| Branch | Purpose |
|---|---|
| `main` | Production |
| `develop` | Integration branch |
| `feature/*` | Feature development |

Example:

```sh
git checkout -b feature/auth-system
```

---

## ☁️ Infrastructure

- **Deployment:** Vercel (frontend)
- **Cloud Services:** AWS (backend, database, etc.)
- See [docs/deployment.md](docs/deployment.md) for the full CI/CD pipeline, env-file setup, and migration workflow.

---

## 🤝 Team Workflow

- Monorepo ensures shared code and consistency across frontend and backend
- Turborepo handles task orchestration and caching
- All developers must complete local setup before feature development begins

---

## 📌 Notes

- Ensure PostgreSQL is running locally or via Docker
- Always run migrations before starting development
- Keep environment variables secure and consistent across environments

---

## 📚 Useful Commands

```sh
pnpm dev        # Run all apps
pnpm build      # Build all apps
pnpm lint       # Lint code
```
