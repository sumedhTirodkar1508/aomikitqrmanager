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
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<anon/publishable key>"
SUPABASE_SERVICE_ROLE_KEY="<service role key — server only>"

# Mobile REST API
MOBILE_API_KEY="<long random string>"
```

| Variable | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | App (Prisma adapter) | Pooled connection. |
| `DIRECT_URL` | `prisma migrate` | Direct (non-pooled) connection. |
| `AUTH_SECRET` | NextAuth | Signs JWT session tokens. |
| `AUTH_URL` | NextAuth | App base URL. |
| `NEXT_PUBLIC_SUPABASE_URL` | Server + client | Project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client | Safe to expose. |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase-server.ts` only | **Never** import into a client component. |
| `MOBILE_API_KEY` | `/api/qr/*` | Sent by the mobile app as `x-api-key`. |

## Prisma

The Prisma client is generated into `src/generated/prisma`. Prisma 7 uses a
driver adapter, so there is no connection URL in `schema.prisma` — it is read
from `DATABASE_URL` in `src/lib/prisma.ts`.

```bash
npm run db:generate    # prisma generate
npm run db:migrate     # prisma migrate dev  (uses DIRECT_URL)
npm run db:seed        # tsx prisma/seed.ts
npm run db:studio      # prisma studio
```

> Import the client from `@/generated/prisma/client`, never `@prisma/client`.

## Supabase Storage (product images)

1. In the Supabase dashboard, create a Storage bucket named **`product-images`**.
2. Make it **public** (public read) so image URLs resolve without signing.
3. Uploads are performed server-side with the service-role key, so no bucket
   write policy is required for anonymous users.

## Upload limits

Server Actions accept up to **6 MB** per request (framework body limit). The
application enforces a 5 MB limit for individual files (product images and CSV
imports). The extra headroom accommodates multipart/form-data encoding overhead.

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

## Test scripts

```bash
npm run test:qr-import   # QR import invariants (integration, requires DB)
npm run test:correctness # Auth + data invariants from Phase 1 (integration, requires DB)
npm run test:phase2      # API hardening + upload unit tests (no DB)
npm run test:export      # CSV export streaming unit tests (no DB)
```
