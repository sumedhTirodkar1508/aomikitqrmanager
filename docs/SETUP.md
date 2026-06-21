# Local Setup

## Prerequisites

- Node.js 20+
- A PostgreSQL database (Supabase recommended)
- A Supabase project (for Storage / product images)

## Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

Or create `.env` manually in the project root:

```bash
# Postgres — use the Supabase pooler URL for the app, direct URL for migrations
DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...supabase.com:5432/postgres"

# NextAuth v5
AUTH_SECRET="<run: openssl rand -base64 32>"
AUTH_URL="http://localhost:3000"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"

SUPABASE_SERVICE_ROLE_KEY="<service role key — server only>"

# Mobile REST API
MOBILE_API_KEY="<long random string>"

# Supabase keep-alive (GitHub Actions heartbeat) — MUST differ from MOBILE_API_KEY
SUPABASE_KEEPALIVE_KEY="<long random string>"
```

| Variable | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | App (Prisma adapter) | Pooled connection. |
| `DIRECT_URL` | `prisma migrate` | Direct (non-pooled) connection. |
| `AUTH_SECRET` | NextAuth | Signs JWT session tokens. |
| `AUTH_URL` | NextAuth | App base URL. |
| `NEXT_PUBLIC_SUPABASE_URL` | Server + client | Project URL. |

| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase-server.ts` only | **Never** import into a client component. |
| `MOBILE_API_KEY` | `/api/qr/*` | Sent by the mobile app as `x-api-key`. |
| `SUPABASE_KEEPALIVE_KEY` | `POST /api/internal/keepalive` | Sent by the keep-alive workflow as `x-keepalive-key`. Must differ from `MOBILE_API_KEY`. |

## Prisma

The Prisma client is generated into `src/generated/prisma`. Prisma 7 uses a
driver adapter, so there is no connection URL in `schema.prisma` — it is read
from `DATABASE_URL` in `src/lib/prisma.ts`.

```bash
npm run db:generate    # prisma generate
npm run db:migrate     # prisma migrate dev  (uses DIRECT_URL)
npm run db:seed        # tsx prisma/seed.ts  (see note below for production)
npm run db:studio      # prisma studio
```

**Note on Production Seeding**: By default, `npm run db:seed` will refuse to run if `NODE_ENV=production` or `VERCEL_ENV=production` to protect the live database. To seed a production database, you must explicitly pass `ALLOW_DEV_SEED=true npm run db:seed`. For Phase 1, production admins should be created via a controlled manual bootstrap rather than the seed script.

> Import the client from `@/generated/prisma/client`, never `@prisma/client`.

## Supabase Storage (product images)

1. In the Supabase dashboard, create a Storage bucket named **`product-images`**.
2. Make it **public** (public read) so image URLs resolve without signing.
3. Uploads are performed server-side with the service-role key, so no bucket
   write policy is required for anonymous users.

## Upload limits

Server Actions accept up to **12 MB** per request (framework body limit). The
application enforces a **10 MB** limit for Excel imports, and a **5 MB** limit
for individual files (product images and QR CSV imports). The extra headroom
accommodates multipart/form-data encoding overhead.

To change the limit, edit `experimental.serverActions.bodySizeLimit` in
`next.config.ts` and keep the per-file guard in the relevant action consistent.

## Role reference

| Role | Access |
| --- | --- |
| `ADMIN` | All admin pages and actions; may also use seller assignment flow |
| `SELLER` | Seller assignment flow only |

Role enforcement uses `requireRole("ADMIN")` or `requireAnyRole("SELLER", "ADMIN")`
on every server-rendered page, layout, and Server Action. The proxy provides an
additional early check but is not the final access control boundary.

## Run

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Visit http://localhost:3000 and sign in with the seeded admin credentials.

## Keep-alive endpoint (local test)

The free Supabase tier pauses inactive projects. `POST /api/internal/keepalive`
runs a harmless `SELECT 1` so a scheduled GitHub Action can keep the database
warm. Test it locally:

```bash
# with SUPABASE_KEEPALIVE_KEY set in .env and the dev server running
curl -i -X POST http://localhost:3000/api/internal/keepalive \
  -H "x-keepalive-key: $SUPABASE_KEEPALIVE_KEY"
# → 200 { "ok": true }   (401 wrong/missing key, 503 if unconfigured)
```

This is **best effort only** — it is not a substitute for Supabase Pro. See
`docs/DEPLOYMENT.md` for the GitHub Actions setup and recovery procedure.

## Test scripts

```bash
npm run test:qr-import        # QR import invariants (integration, requires DB)
npm run test:correctness      # Auth + data invariants from Phase 1 (integration, requires DB)
npm run test:phase2           # API hardening + upload unit tests (no DB)
npm run test:export           # CSV export streaming unit tests (no DB)
npm run test:replacement-rules
npm run test:images
npm run test:pagination       # catalog pagination logic + page wiring (no DB)
npm run test:combobox         # seller combobox filtering + wiring (no DB)
npm run test:qr-payload       # QR scan/manual payload parser (no DB)
npm run test:keepalive        # keep-alive endpoint + workflow (DB optional)
npm run test:excel-import     # Excel importers + templates (DB optional)
```
