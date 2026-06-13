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
npm run db:seed   # optional: seed admin + sample catalog
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
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | anon/publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service-role key (server-only) |
   | `MOBILE_API_KEY` | long random string |

3. Build settings (defaults are fine):
   - Install: `npm install`
   - Build: `npm run build`
   - The Prisma client is generated to `src/generated/prisma`. Ensure
     `prisma generate` runs during install/build — add a `postinstall` script
     (`"postinstall": "prisma generate"`) if your generated client is not
     committed.

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

## Notes

- Next.js 16 uses `src/proxy.ts` (the renamed middleware). Do not rename it.
- Server Actions and Route Handlers run on the Node.js runtime (Prisma adapter
  requires it).
- Rotate `MOBILE_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` before going to
  production; the defaults in `.env` are development placeholders.
- `next-auth` is pinned to `5.0.0-beta.31` (exact, no caret). Upgrading to
  another beta or to stable requires a separate compatibility review — do not
  bump it incidentally during dependency updates.
