# EMS System Monorepo

This is the Employee Management System (EMS) built using a modern monorepo architecture powered by Turborepo.

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
