# Deployment (Vercel + Supabase)

## 1. Supabase

1. Create a Supabase project. Note the **Project URL** and the **anon** and
   **service_role** keys (Settings → API).
2. Get both Postgres connection strings (Settings → Database):
   - **Pooler / Transaction** connection → `DATABASE_URL`
   - **Direct** connection → `DIRECT_URL`
3. Create a public Storage bucket named **`product-images`**.

## 2. Database schema

Run migrations against the **direct** URL (pooled connections do not support
DDL well):

```bash
DIRECT_URL="postgresql://...:5432/postgres" npm run db:migrate
# To seed a production database, you must explicitly opt-in:
ALLOW_DEV_SEED=true npm run db:seed   # optional: seed admin + sample catalog
```

In CI/CD you may prefer `prisma migrate deploy` instead of `migrate dev`.

## 3. Vercel

1. Import the repository into Vercel.
2. Set environment variables (Project → Settings → Environment Variables):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | Supabase pooler URL |
   | `DIRECT_URL` | Supabase direct URL |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `AUTH_URL` | `https://<your-domain>` |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |

   | `SUPABASE_SERVICE_ROLE_KEY` | service-role key (server-only) |
   | `MOBILE_API_KEY` | long random string |
   | `SUPABASE_KEEPALIVE_KEY` | long random string (must differ from `MOBILE_API_KEY`) |

3. Build settings (defaults are fine):
   - Install: `npm install`
   - Build: `npm run build`
   - The Prisma client is generated to `src/generated/prisma`.
   - This repository intentionally has no Prisma `postinstall` hook. Configure
     Vercel or CI to run `npm run db:generate` before `npm run build` when the
     generated client is not already available.

4. Deploy.

## 4. Post-deploy checks

- Sign in at `/login` (seeded admin).
- Generate a token batch at `/admin/qr-tokens/generate`.
- Assign a kit at `/seller/assign`.
- Hit the mobile API:

  ```bash
  curl -H "x-api-key: $MOBILE_API_KEY" \
    https://<your-domain>/api/qr/<TOKEN>
  ```

## 5. Supabase keep-alive (free-tier heartbeat)

The free Supabase tier pauses a project after a period of inactivity. A
scheduled GitHub Action pings a protected app endpoint that runs a harmless
`SELECT 1`, keeping the database warm.

**Why an app endpoint (not direct DB access)?** GitHub never receives database
credentials or the Supabase service-role key. It only holds a dedicated header
secret and calls the public app route, which performs a read-only query.

### Why it exists / what it is not

- It is **best effort only** and does **not** guarantee uptime.
- The correct production availability solution is **Supabase Pro** (no pausing).
- Scheduled GitHub Actions can be delayed or skipped under load and are paused
  on inactive repositories — do not rely on exact timing.

### Endpoint

`POST /api/internal/keepalive` (Node runtime, dynamic, `Cache-Control: no-store`):

- `200 { "ok": true }` on a successful DB ping.
- `401` for a missing/wrong/length-mismatched `x-keepalive-key`.
- `503` when `SUPABASE_KEEPALIVE_KEY` is not configured, or on DB failure
  (generic — no host, schema, latency, or stack details leak).

### Vercel

Set `SUPABASE_KEEPALIVE_KEY` (distinct from `MOBILE_API_KEY`) in Project →
Settings → Environment Variables.

### GitHub repository secrets

Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
| --- | --- |
| `AOMI_KEEPALIVE_URL` | `https://<your-domain>/api/internal/keepalive` |
| `AOMI_KEEPALIVE_KEY` | the same value as Vercel's `SUPABASE_KEEPALIVE_KEY` |

### Workflow

`.github/workflows/supabase-keepalive.yml` runs on two non-round daily
schedules (07:17 and 19:43 UTC) and via **Run workflow** (workflow_dispatch).
It uses minimal permissions (`contents: read`), a short job timeout, no
repository checkout, and retries transient failures with staged back-off. The
secret is only ever sent in the request header — never printed.

### Manual run, history, and recovery

- **Manual run:** GitHub → Actions → *Supabase Keep-Alive* → **Run workflow**.
- **History:** the same Actions page lists every scheduled and manual run.
- **Recovery after failure:**
  1. Open the failed run's logs (the secret is never printed there).
  2. If the project was already paused, open the Supabase dashboard and resume
     it (or run any query), then re-run the workflow to confirm `200`.
  3. Verify `AOMI_KEEPALIVE_URL`/`AOMI_KEEPALIVE_KEY` match the deployed
     `SUPABASE_KEEPALIVE_KEY`.
- **Optional second heartbeat:** an external uptime monitor may also POST to the
  same endpoint with the `x-keepalive-key` header configured as a secret.

## Notes

- Next.js 16 uses `src/proxy.ts` (the renamed middleware). Do not rename it.
- Server Actions and Route Handlers run on the Node.js runtime (Prisma adapter
  requires it).
- NextAuth uses JWT sessions with a 12-hour maximum age. Server authorization
  continues to revalidate the active user against PostgreSQL on every request.
- Newly generated QR tokens use `PREFIX-XXXXXX`, where the six-character suffix
  is produced with cryptographically secure nanoid randomness. Imported and
  previously stored token formats remain accepted.
- `src/lib/mobile-api.ts`, `src/lib/server/env.ts`,
  `src/lib/supabase-server.ts`, and
  `src/lib/server/image-signatures.ts` are enforced server-only boundaries.
- Rotate `MOBILE_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` before going to
  production; the defaults in `.env` are development placeholders.
- `next-auth` is pinned to `5.0.0-beta.31` (exact, no caret). Upgrading to
  another beta or to stable requires a separate compatibility review — do not
  bump it incidentally during dependency updates.
