# AOMI Kit QR Manager

Admin and seller tooling for managing AOMI skincare kits: a product/routine
catalog, a QR-token lifecycle engine, an in-store seller assignment flow, and a
mobile REST API that activated kits read from.

## Tech stack

- **Next.js 16** (App Router, Server Actions, Turbopack) — note: middleware is
  `src/proxy.ts` in Next 16
- **React 19**
- **Prisma 7** with the `@prisma/adapter-pg` driver adapter (PostgreSQL)
- **NextAuth v5** (Credentials provider, JWT sessions)
- **Supabase** — Postgres database + Storage (product images)
- **Tailwind CSS v4** + shadcn/ui components
- **Zod** for validation

## Features

| Area | Routes |
| --- | --- |
| Catalog | `/admin/products`, `/admin/diagnoses`, `/admin/routine-types` |
| Product images | Upload/reorder/delete on the product edit page (Supabase Storage) |
| Replacement rules | Managed on the product edit page |
| Routines | `/admin/routines`, `/admin/routines/new`, `/admin/routines/[id]` |
| QR tokens | `/admin/qr-tokens`, `…/generate`, `…/import`, `/admin/batches` |
| Token CSV export | `/api/admin/qr-tokens/export` |
| Seller assignment | `/seller`, `/seller/assign` |
| Mobile API | `GET /api/qr/[token]`, `POST /api/qr/activate` |

## Quick start

```bash
npm install
cp .env.example .env   # then fill in the values (see docs/SETUP.md)

npm run db:generate    # generate the Prisma client into src/generated/prisma
npm run db:migrate     # apply migrations to your database
npm run db:seed        # seed an admin user + sample catalog

npm run dev            # http://localhost:3000
```

Sign in at `/login`. Admins land on `/admin`, sellers on `/seller`.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — ESLint
- `npm run db:generate` — generate the Prisma client
- `npm run db:migrate` — run `prisma migrate dev`
- `npm run db:seed` — run the seed script
- `npm run db:studio` — open Prisma Studio
- `npm run test:qr-import` — QR import integration tests (requires DB)
- `npm run test:correctness` — auth + data invariant tests (requires DB)
- `npm run test:phase2` — API hardening + upload unit tests
- `npm run test:export` — CSV export streaming unit tests

## Project notes

- The Prisma client is generated to `src/generated/prisma`. Import it via
  `@/generated/prisma/client`, **never** `@prisma/client`.
- Admin Server Actions call `requireRole("ADMIN")`; seller Server Actions call
  `requireAnyRole("SELLER", "ADMIN")`. Both roles may use the assignment flow.
- QR token state transitions use `updateMany` with a status guard so concurrent
  assignment/activation cannot clobber each other.
- The Supabase service-role key is confined to `src/lib/supabase-server.ts` and
  must never be imported from a client component.
- `next-auth` is pinned to an exact beta version (`5.0.0-beta.31`). Migration
  to stable is a future controlled task.

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — environment variables and local setup
- [docs/API.md](docs/API.md) — mobile API reference
- [docs/QR_TOKEN_LIFECYCLE.md](docs/QR_TOKEN_LIFECYCLE.md) — token state machine
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel + Supabase deployment
