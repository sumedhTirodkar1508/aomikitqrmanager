# AOMI Kit QR Manager — Codebase Map

> Navigation aid for agents and developers. Architecture facts live here; behavioral rules live in `AGENTS.md`.
> Current source code is always authoritative — verify paths and types before editing.

---

## Project purpose

AOMI Kit QR Manager is a Next.js web application that manages the full lifecycle of skincare-kit QR codes:

1. **Admin** creates products, diagnoses, routine templates, and generates/imports QR token batches.
2. **Seller** scans or enters a QR token, selects a diagnosis/routine, and locks a `Package` snapshot to the token.
3. **Mobile app** scans the token, retrieves the package payload, and POSTs an activation to unlock the kit.

---

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 App Router | `src/proxy.ts` (not `middleware.ts`) |
| Runtime | Node.js (default) | Prisma adapter requires it |
| Language | TypeScript | strict mode |
| Auth | NextAuth v5 beta.31 (pinned exact) | JWT strategy, Credentials provider, 12-hour max age |
| ORM | Prisma 7.8 + `@prisma/adapter-pg` | no URL in `schema.prisma` |
| Database | PostgreSQL (Supabase) | pooler URL for app, direct URL for migrations |
| Storage | Supabase Storage | bucket `product-images`, server-side upload only |
| UI | shadcn/ui (Radix Luma preset `b3ST8r2wy`) | semantic tokens, Tailwind CSS |
| Validation | Zod 4 | used in Server Actions and import |
| CSV parsing | PapaParse | header + flat modes |
| Token generation | nanoid | six secure random characters from an unambiguous 32-char alphabet |
| Icons | Lucide React | |

---

## Directory structure

```
.
├── prisma/
│   ├── schema.prisma          # authoritative DB schema
│   ├── migrations/            # committed migration history
│   ├── prisma.config.ts       # CLI config — loads DIRECT_URL, uses PrismaClient
│   └── seed.ts                # repeatable seed (upserts admin, catalog)
├── scripts/
│   ├── test-qr-token-import-integrity.ts  # integration test: import invariants
│   ├── test-core-correctness.ts           # integration test: auth + data invariants (Phase 1)
│   ├── test-phase2.ts                     # unit tests: API hardening + upload (Phase 2)
│   ├── test-export-streaming.ts           # unit tests: CSV export logic (Phase 3)
│   ├── test-replacement-rules.ts          # integration tests: replacement-rule invariants (14 assertions)
│   ├── test-images.ts                     # unit + integration tests: image management (14 assertions)
│   └── audit-replacement-rules.ts         # dry-run audit: flags ProductReplacement records with stepType mismatch
├── public/
│   └── logo/
│       └── aomiLogo.svg       # application logo — used in all shell/branding locations
├── src/
│   ├── app/
│   │   ├── layout.tsx         # root layout (font, Toaster)
│   │   ├── not-found.tsx      # global 404 page
│   │   ├── error.tsx          # root error boundary (client component)
│   │   ├── page.tsx           # root redirect based on role
│   │   ├── login/page.tsx     # credential login form
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts  # NextAuth handler
│   │   │   ├── admin/qr-tokens/export/route.ts  # GET — streaming CSV export
│   │   │   └── qr/
│   │   │       ├── [token]/route.ts   # GET — mobile token lookup
│   │   │       └── activate/route.ts  # POST — mobile activation
│   │   ├── (admin)/
│   │   │   ├── layout.tsx             # admin shell (desktop sidebar, mobile nav, auth guard)
│   │   │   ├── error.tsx              # admin group error boundary
│   │   │   ├── admin/page.tsx         # admin dashboard
│   │   │   ├── admin/products/        # product CRUD + image mgmt
│   │   │   ├── admin/diagnoses/       # diagnosis CRUD
│   │   │   ├── admin/routine-types/   # routine type CRUD
│   │   │   ├── admin/routines/        # routine template CRUD
│   │   │   └── admin/qr-tokens/       # QR token table, generate, import, void
│   │   └── (seller)/
│   │       ├── layout.tsx             # seller shell (auth guard, header nav with logo)
│   │       ├── error.tsx              # seller group error boundary
│   │       ├── seller/page.tsx        # seller dashboard
│   │       └── seller/assign/         # multi-step assignment flow
│   ├── auth.ts                # NextAuth config (Credentials + bcrypt)
│   ├── auth.config.ts         # edge-safe config (jwt + session callbacks)
│   ├── proxy.ts               # Next.js 16 middleware (route guards)
│   ├── types/next-auth.d.ts   # augments Session/User/JWT with id+role
│   ├── components/
│   │   ├── admin-nav.tsx         # desktop admin sidebar nav links
│   │   ├── admin-mobile-nav.tsx  # mobile admin top bar + Sheet nav (aomiLogo.svg only, no QR icon)
│   │   ├── auth/
│   │   │   ├── login-form.tsx    # credential login form (aomiLogo.svg branding, no QR icon)
│   │   │   └── logout-button.tsx # full-width logout button (sidebar-aligned)
│   │   └── ui/                   # shadcn primitives + custom components
│   ├── lib/
│   │   ├── prisma.ts          # PrismaClient singleton (PrismaPg adapter)
│   │   ├── auth-helpers.ts    # requireAuth(), requireRole(), requireAnyRole()
│   │   ├── supabase-server.ts # getSupabaseAdmin(), productImagePublicUrl() — server-only, "server-only" sentinel
│   │   ├── mobile-api.ts      # server-only checkMobileApiKey() — timing-safe comparison
│   │   ├── image-signature-utils.ts # pure magic-byte parser for server wrapper + tests
│   │   ├── token.ts           # generateToken(), normalizeToken(), isValidTokenFormat()
│   │   ├── audit.ts           # writeAuditLog() — accepts optional tx for use inside transactions
│   │   ├── slug.ts            # toSlug()
│   │   ├── utils.ts           # cn() (Tailwind merge)
│   │   └── server/
│   │       ├── import-qr-tokens.ts  # processQRTokenImport() service
│   │       ├── current-user.ts      # getCurrentUser() — DB-backed, React cache()
│   │       ├── env.ts               # server-only validateEnv(), requireEnv()
│   │       └── image-signatures.ts  # server-only upload-validation wrapper
│   └── generated/prisma/      # generated Prisma client — DO NOT EDIT
├── docs/
│   ├── CODEBASE_MAP.md        # this file
│   ├── API.md                 # mobile REST API reference
│   ├── SETUP.md               # local dev setup
│   ├── DEPLOYMENT.md          # Vercel + Supabase deployment
│   └── QR_TOKEN_LIFECYCLE.md  # state machine reference
├── graphify-out/
│   ├── GRAPH_REPORT.md        # auto-generated knowledge graph report (2026-06-14: 335 nodes, 274 edges)
│   ├── graph.json             # machine-readable graph (gitignored)
│   └── graph.html             # interactive visualization (gitignored)
├── .env.example               # template — copy to .env and fill in values
├── AGENTS.md                  # canonical agent rules
├── CLAUDE.md                  # Claude pointer to AGENTS.md
└── package.json
```

---

## Route map

### Admin pages (`/admin/*`)

| Route | Page file | Server Actions file |
|---|---|---|
| `/admin` | `admin/page.tsx` | — |
| `/admin/products` | `admin/products/page.tsx` | `admin/products/actions.ts` |
| `/admin/products/[id]` | `admin/products/[id]/page.tsx` | `admin/products/[id]/image-actions.ts`, `[id]/replacement-actions.ts` |
| `/admin/diagnoses` | `admin/diagnoses/page.tsx` | `admin/diagnoses/actions.ts` |
| `/admin/routine-types` | `admin/routine-types/page.tsx` | `admin/routine-types/actions.ts` |
| `/admin/routines` | `admin/routines/page.tsx` | `admin/routines/actions.ts` |
| `/admin/qr-tokens` | `admin/qr-tokens/page.tsx` | `admin/qr-tokens/actions.ts` |
| `/admin/qr-tokens/generate` | `admin/qr-tokens/generate/page.tsx` | `admin/qr-tokens/generate/generate-actions.ts` |
| `/admin/qr-tokens/import` | `admin/qr-tokens/import/page.tsx` | `admin/qr-tokens/import/import-actions.ts` |
| `/admin/batches` | redirect → `/admin/qr-tokens` | — |

### Seller pages (`/seller/*`)

| Route | Page file | Server Actions file |
|---|---|---|
| `/seller` | `seller/page.tsx` | — |
| `/seller/assign` | `seller/assign/page.tsx` | `seller/assign/actions.ts` |

### API routes

| Method | Path | File |
|---|---|---|
| POST | `/api/auth/[...nextauth]` | NextAuth handler |
| GET | `/api/admin/qr-tokens/export` | `app/api/admin/qr-tokens/export/route.ts` |
| GET | `/api/admin/templates/[entity]` | `app/api/admin/templates/[entity]/route.ts` (ADMIN — XLSX template download) |
| GET | `/api/qr/[token]` | `app/api/qr/[token]/route.ts` |
| POST | `/api/qr/activate` | `app/api/qr/activate/route.ts` |
| POST | `/api/internal/keepalive` | `app/api/internal/keepalive/route.ts` (keep-alive heartbeat) |

---

## Auth and role flow

```
Request arrives
    │
    ├─► src/proxy.ts  ─── checks session ──► /login (if unauthenticated)
    │                      checks role  ──► / (if wrong role for /admin or /seller)
    │
    ├─► Server Component / Server Action
    │       └── requireAuth()            — rejects if no live DB user
    │       └── requireRole("ADMIN")     — rejects if not ADMIN
    │       └── requireAnyRole("SELLER","ADMIN") — rejects if neither role
    │
    └─► API Route (/api/qr/*)
            └── checkMobileApiKey(req) — returns 401/503 if key missing/wrong
```

- `requireAuth()`, `requireRole()`, and `requireAnyRole()` live in `src/lib/auth-helpers.ts`.
- They call `getCurrentUser()` (`src/lib/server/current-user.ts`) which re-queries the DB on every request so deactivated users are rejected immediately — not just at next login.
- `checkMobileApiKey()` lives in `src/lib/mobile-api.ts` and uses `crypto.timingSafeEqual`.
- Session data includes `{ id, email, name, role }`. Role is encoded in the JWT.
- JWT sessions have an explicit maximum age of 12 hours (`43,200` seconds).
- `getCurrentUser()` still queries PostgreSQL on protected requests, so user
  deletion or deactivation revokes access before JWT expiry.
- **Admin** Server Actions call `requireRole("ADMIN")` as their first statement.
- **Seller** Server Actions call `requireAnyRole("SELLER", "ADMIN")` — both roles may use the assignment flow.

---

## Database schema map

> Full schema in `prisma/schema.prisma`. Summary of key models:

| Model | Key fields | Relations |
|---|---|---|
| `User` | id, email, name, passwordHash, role (ADMIN/SELLER), isActive | — |
| `Product` | id, name, sku, stepType, category, functionDescription, active | ProductImage[], ProductReplacement[] |
| `ProductImage` | id, productId, imageUrl, imageType (FRONT/SECONDARY/REFERENCE), sortOrder | Product |
| `Diagnosis` | id, name, slug (unique), description, active | RoutineTemplateDiagnosis[] |
| `RoutineType` | id, name, slug (unique), active | RoutineTemplate[] |
| `RoutineTemplate` | id, name, routineTypeId, active, durationDays, generalInstructions | RoutineTemplateDiagnosis[], RoutineTemplateStep[] |
| `RoutineTemplateDiagnosis` | routineTemplateId, diagnosisId | M:N join |
| `RoutineTemplateStep` | id, routineTemplateId, stepNumber, stepType, defaultProductId, instruction | RoutineTemplate, Product |
| `ProductReplacement` | id, sourceProductId, replacementProductId, stepType, active | Product (source), Product (replacement) |
| `QRTokenBatch` | id, batchName, prefix, quantity, source (GENERATED/IMPORTED), createdByUserId | QRToken[] |
| `QRToken` | id, token (unique), batchId, status, generatedByUserId, importedByUserId, assignedAt, activatedAt, voidedAt, replacedByTokenId | QRTokenBatch, Package? |
| `Package` | id, qrTokenId (unique), routineTemplateId, status, createdByUserId | QRToken, PackageProduct[], RoutineTemplate |
| `PackageProduct` | id, packageId, routineTemplateStepId?, stepNumber, stepType, productId, originalProductId?, isReplacement, instruction? | Package |
| `ActivationEvent` | id, qrTokenId, packageId?, externalUserId?, eventType, metadataJson | QRToken |
| `AuditLog` | id, actorUserId?, action, entityType?, entityId?, metadataJson | — |

**Key design decisions:**
- `PackageProduct.productId` is a loose FK (no referential constraint) — deliberate, so product deactivation doesn't cascade-delete assignment history.
- `QRToken` has `@@index([status])` for lifecycle queries.
- `Package` has a unique constraint on `qrTokenId` (one package per token).
- `Diagnosis` and `RoutineType` both have a `slug` unique field.

---

## QR token lifecycle

```
generate / import
       │
       ▼
   AVAILABLE ──────────────────────► VOIDED (terminal)
       │                               ▲
       │ seller assign                 │ admin void
       ▼                               │
   ASSIGNED ──────────────────────────┘
       │
       │ mobile activate
       ▼
   ACTIVATED (terminal)
       │
       │ (REPLACED — schema-supported but not yet implemented via UI)
       ▼
   REPLACED (terminal)
```

All status transitions use `updateMany({ where: { id, status: <expected> } })` and check `count === 0` to reject races. See `docs/QR_TOKEN_LIFECYCLE.md` for full table.

Voiding a token also syncs the linked `Package.status` to `VOIDED` in the same transaction.

Generated token values use `PREFIX-XXXXXX`. The suffix is six characters from
the 32-character `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` alphabet and is generated
by nanoid using cryptographically secure randomness. Generation checks both
in-memory batch uniqueness and existing database values. CSV imports continue
to accept the existing general token format and do not rewrite stored tokens.

---

## Package lifecycle

```
Package is created ──► ASSIGNED
       │
       │ mobile activation (POST /api/qr/activate)
       ▼
   ACTIVATED
       │
       │ admin void (voids the QRToken)
       ▼
   VOIDED
```

`Package.status` is always synchronized with its linked `QRToken.status`. Both transitions (ASSIGNED→ACTIVATED and *→VOIDED) happen inside the same Prisma `$transaction` as the QRToken status update.

---

## Seller assignment flow

Multi-step form in `src/app/(seller)/seller/assign/`:

1. `validateToken(token)` — Server Action: checks token exists + is AVAILABLE. Returns early feedback. **Not trusted** at commit time.
2. `getRoutinesForDiagnosis(diagnosisId)` — Server Action: returns matching active routine templates.
3. `getRoutinePreview(routineId)` — Server Action: builds the step list with replacement options. Takes one argument (routineId only).
4. `confirmAssignment(payload)` — Server Action (Zod-validated):
   - Re-validates all product selections server-side against authoritative option set.
   - Cross-stepType selections are rejected: each selected product must match the step's `stepType`.
   - `updateMany({ where: { id, status: "AVAILABLE" } })` race guard.
   - Creates `Package` + `PackageProduct[]` snapshot in the same `$transaction`.
   - Throws `TOKEN_TAKEN` if count === 0.
   - Writes audit log inside the transaction.
   - Verifies that all chosen diagnoses still exist before committing.

All four actions enforce `requireAnyRole("SELLER", "ADMIN")`.

Key files:
- `src/app/(seller)/seller/assign/actions.ts` — all four Server Actions
- `src/app/(seller)/seller/assign/_components/assign-flow.tsx` — client orchestrator

---

## Replacement rule flow and invariants

The admin can configure replacement products for any product on the product detail page.

**Invariants:**
- `ProductReplacement.stepType` must equal both `source.stepType` and `replacement.stepType`.
- `addReplacementRule` (Server Action) derives `stepType` from the source product server-side — never from form input.
- Candidates are filtered to the same `stepType` as the source product before display.
- Changing a product's `stepType` via `updateProduct` is blocked if any `ProductReplacement` row references it as either source or replacement.
- The admin must delete all rules before changing the step type.

**Audit:**
```bash
npm run audit:replacement-rules   # dry-run — flags mismatched stepType rules in DB
npm run test:replacement-rules    # 14 integration assertions covering all invariants
```

Key files:
- `src/app/(admin)/admin/products/[id]/_components/replacement-rules.tsx` — UI (label above, Select + Button on same row at sm+)
- `src/app/(admin)/admin/products/[id]/replacement-actions.ts` — `addReplacementRule`, `deleteReplacementRule`
- `scripts/audit-replacement-rules.ts` — production audit script
- `scripts/test-replacement-rules.ts` — regression test (14 assertions, cases A–N)

---

## Product image upload and display flow

Upload path (server-only):

```
browser → multipart FormData → uploadProductImage() Server Action
  │
  ├── requireRole("ADMIN")
  ├── Zod validates imageType enum
  ├── 5MB size guard
  ├── Magic-byte detection (detectMime) validates actual file content
  │     — JPEG, PNG, GIF, WebP accepted; client-supplied file.type is ignored
  ├── getSupabaseAdmin().storage.upload(path, buffer, { contentType: detectedMime })
  └── prisma.productImage.create({ imageUrl, imageType, sortOrder })
        — on DB failure, storage object is removed to avoid orphans
```

Delete path:
```
deleteProductImage()
  │
  ├── prisma.productImage.delete()  ← DB first (authoritative)
  └── storage.remove(objectPath)    ← best-effort after DB succeeds
```

Reorder path:
```
reorderProductImages(productId, orderedIds[])
  │
  └── prisma.$transaction: updates sortOrder to 0, 1, 2… for each id in sequence
```

**Primary image:** The `ProductImage` row with the lowest `sortOrder` is the primary/display image. `reorderProductImages` normalizes sort orders to `0, 1, 2…` on every reorder.

**Admin product list:** fetches `images: { take: 1, orderBy: { sortOrder: 'asc' } }` — one image per product, no N+1.

**Product details UI:** `ProductImages` component (`product-images.tsx`) shows a multi-image queue picker with per-image type assignment, sequential upload, reorder arrows, and delete. First image is labeled "Primary".

**Mobile API:** Both `imageUrl` and `primaryImageUrl` fields are included in the package payload (backward compatibility).

Storage client: `src/lib/supabase-server.ts` — `getSupabaseAdmin()`. Guarded by `"server-only"` import sentinel. **Never import from a client component.**

---

## Supabase server/storage boundary

`src/lib/supabase-server.ts`:
- Imports `"server-only"` — causes a hard build error if accidentally imported in a client component.
- Validates `NEXT_PUBLIC_SUPABASE_URL` with `new URL()` and rejects non-http/https protocols on initialization.
- Caches the SupabaseClient singleton in module scope (one client per server process).
- Exports `PRODUCT_IMAGES_BUCKET = "product-images"`.
- Exports `getSupabaseAdmin()` and `productImagePublicUrl(path)`.

The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It must never appear in `NEXT_PUBLIC_*` or client-component imports.

## Server-only module boundaries

The following privileged entry points import the real `server-only` sentinel:

- `src/lib/mobile-api.ts` — reads `MOBILE_API_KEY` and authenticates mobile API requests.
- `src/lib/server/env.ts` — reads and validates server environment variables.
- `src/lib/supabase-server.ts` — reads the Supabase service-role key.
- `src/lib/server/image-signatures.ts` — server upload-validation entry point.

Image magic-byte parsing itself is dependency-free in
`src/lib/image-signature-utils.ts` so standalone tests can exercise it without
weakening the server-only wrapper. Client dependency checks stop at `"use server"`
action modules and verify that no Client Component reaches a privileged entry point.

---

## CSV import flow

Entry: `src/app/(admin)/admin/qr-tokens/import/import-actions.ts` (thin Server Action wrapper)

Core logic: `src/lib/server/import-qr-tokens.ts` → `processQRTokenImport()`

```
CSV text
  │
  ├── PapaParse (header mode or flat mode)
  ├── normalizeToken() + isValidTokenFormat() — mark invalid
  ├── File-level deduplication (Set)
  ├── DB-level deduplication (findMany)
  └── $transaction (atomic):
        ├── QRTokenBatch.create()
        ├── QRToken.createMany({ skipDuplicates: true })
        ├── delete empty batch if count === 0
        ├── update batch.quantity if concurrent dup reduced count
        └── writeAuditLog(…, tx)    ← audit inside same transaction

Invariant enforced (throws if violated):
  totalRows === invalid + skippedDuplicate + inserted
```

**Concurrency protection:** `createMany({ skipDuplicates: true })` relies on the DB unique constraint on `QRToken.token` to atomically skip tokens that arrive concurrently from another import. The returned `count` is used to reconcile `batch.quantity`.

Test: `npm run test:qr-import` (`scripts/test-qr-token-import-integrity.ts`)

---

## CSV export flow

`GET /api/admin/qr-tokens/export` — `src/app/api/admin/qr-tokens/export/route.ts`

- Requires ADMIN role (DB-backed via `getCurrentUser()`).
- Accepts `?status=` and `?batch=` filter params (same filters as the UI).
- Streams output via `ReadableStream` in 500-row cursor-based chunks to avoid loading all tokens into memory.
- Cursor ordering: `(createdAt ASC, id ASC)` — deterministic across pages.
- Header emitted once; rows streamed incrementally.
- Client disconnect handled via the stream `cancel()` callback.
- `Cache-Control: no-store` set on the response.

---

## Supabase keep-alive flow

- `POST /api/internal/keepalive` (in `src/app/api/internal/keepalive/route.ts`) performs a read-only `SELECT 1` ping to prevent project pause.
- Authenticated via timing-safe `x-keepalive-key` comparison (`src/lib/keepalive.ts` / `src/lib/mobile-api.ts`).
- Triggered by a GitHub Actions cron job (`.github/workflows/supabase-keepalive.yml`) with retry behavior.
- Returns strict `Cache-Control: no-store` headers.

---

## Mobile API flow

All routes require `x-api-key: <MOBILE_API_KEY>` header. Key comparison uses `crypto.timingSafeEqual` (constant-time). See `docs/API.md` for full spec.

All mobile route responses include `Cache-Control: no-store`.

### GET `/api/qr/[token]`

File: `src/app/api/qr/[token]/route.ts`

- Awaits `params` (Next.js 16 async params).
- Guards `decodeURIComponent` with try/catch — returns 400 on malformed percent-encoding.
- Returns status-specific JSON: AVAILABLE (minimal), VOIDED/REPLACED (message), ASSIGNED/ACTIVATED (full package payload with steps, products, `imageUrl`, and `primaryImageUrl`).
- No stack traces in error responses.

### POST `/api/qr/activate`

File: `src/app/api/qr/activate/route.ts`

- Schema: `token` is trimmed, min 1, max 500 chars. `externalUserId` is trimmed, max 200 chars.
- Idempotent: ACTIVATED tokens return 200 without re-running side effects.
- Race guard: `updateMany({ where: { id, status: "ASSIGNED" } })`.
- On success (inside `$transaction`): sets `QRToken.status = ACTIVATED`, sets `Package.status = ACTIVATED`, creates `ActivationEvent`, writes `AuditLog`.

---

## Admin shell components

| Component | File | Notes |
|---|---|---|
| Desktop sidebar | `(admin)/layout.tsx` | sticky, 17rem wide, aomiLogo.svg, nav links, user card, logout |
| Mobile top bar | `src/components/admin-mobile-nav.tsx` | sticky h-16, hamburger button, aomiLogo.svg |
| Mobile nav Sheet | `src/components/admin-mobile-nav.tsx` | 19rem left Sheet, aomiLogo.svg header, nav links, logout |
| Nav links | `src/components/admin-nav.tsx` | shared between desktop and mobile sheet |
| Logout button | `src/components/auth/logout-button.tsx` | `w-full justify-start` — matches sidebar nav item alignment |
| Login page | `src/components/auth/login-form.tsx` | two-panel card; aomiLogo.svg in both desktop left panel and mobile card header |

**Branding rule:** All shell and authentication branding locations use only `public/logo/aomiLogo.svg`. The previous Lucide `QrCode` icon + colored background has been removed from all locations. `next/image` with `priority` prop is used for all above-the-fold logo instances (resolves LCP warning).

---

## Seller shell components

| Component | File | Notes |
|---|---|---|
| Seller header | `(seller)/layout.tsx` | h-16, aomiLogo.svg link, Home + Assign nav, email + logout |

---

## QR-token page query phases

`/admin/qr-tokens` (page.tsx) runs queries in two phases to minimize serialization:

**Phase 1 (parallel):** `totalCount` + `batches` + `statsGroup` + `detailedToken`
- `batches`, `statsGroup`, and `detailedToken` are independent of `totalCount`; they run at the same time.

**Phase 2 (single):** page `tokens` query
- Depends on the clamped `page` value derived from `totalCount`, so it must wait for Phase 1.

Before optimization: 2 phases (1 then 4). After: 2 phases (4 then 1) — batches, statsGroup, and detailedToken no longer wait behind totalCount.

**Filter-aware count:** The primary count card on the QR Tokens page reflects the current filter (status + batch + search). Secondary status-breakdown cards are global (unfiltered) and labeled "Across all batches".

**Batch filter removed from sidebar:** `/admin/batches` redirects to `/admin/qr-tokens`. Batch data is a filter and column on the QR Tokens page only.

---

## Server Actions inventory

| Action | File | Auth guard |
|---|---|---|
| `createProduct`, `updateProduct`, `toggleProductActive` | `admin/products/actions.ts` | `requireRole("ADMIN")` |
| `uploadProductImage`, `deleteProductImage`, `reorderProductImages` | `admin/products/[id]/image-actions.ts` | `requireRole("ADMIN")` |
| `addReplacementRule`, `deleteReplacementRule` | `admin/products/[id]/replacement-actions.ts` | `requireRole("ADMIN")` |
| `createDiagnosis`, `updateDiagnosis`, `toggleDiagnosisActive` | `admin/diagnoses/actions.ts` | `requireRole("ADMIN")` |
| `createRoutineType`, `updateRoutineType`, `toggleRoutineTypeActive` | `admin/routine-types/actions.ts` | `requireRole("ADMIN")` |
| `createRoutine`, `updateRoutine`, `toggleRoutineActive` | `admin/routines/actions.ts` | `requireRole("ADMIN")` |
| `voidToken` | `admin/qr-tokens/actions.ts` | `requireRole("ADMIN")` |
| `generateBatch` | `admin/qr-tokens/generate/generate-actions.ts` | `requireRole("ADMIN")` |
| `importTokens` | `admin/qr-tokens/import/import-actions.ts` | `requireRole("ADMIN")` |
| `validateToken`, `getRoutinesForDiagnosis`, `getRoutinePreview`, `confirmAssignment` | `seller/assign/actions.ts` | `requireAnyRole("SELLER","ADMIN")` |

---

## Token search behavior

`/admin/qr-tokens` uses `contains` (substring) for the `?q=` filter:
```ts
where.token = { contains: sp.q.toUpperCase() }
```
This is intentional for the current modest dataset. A `pg_trgm` GIN index would be needed if the table grows to ~100k+ rows and search latency becomes measurable. Do not silently swap to `startsWith` — the UX expectation is substring match.

---

## Catalog pagination

Products, diagnoses, routine types, and routines use **server-side pagination**
driven by `page`, `pageSize`, and `q` (plus route-specific filters). Shared logic
lives in `src/lib/pagination.ts` (`resolvePagination`, `resolvePageSize`,
`getPaginationRange`) and the reusable client footer is
`src/components/ui/data-pagination.tsx`.

- Default page size 25; allowed 25 / 50 / 100.
- Each page runs `count` (with the canonical `where`) in parallel with any
  independent queries, then `findMany` with `skip`/`take`.
- Page is clamped to `[1, lastPage]`; an excessive page returns the last page.
- Every `orderBy` ends with an `id` tiebreaker for deterministic ordering.
- Filters/search reset the page (forms omit `page`, preserve `pageSize`).

## Excel import framework

Page-specific XLSX templates and dry-run imports for products, diagnoses,
routine types, and routines. See `docs/EXCEL_IMPORTS.md` for the full spec.

- Library: `exceljs` (read + write + data-validation dropdowns). SheetJS (`xlsx`)
  is intentionally not used.
- Core/parse/types: `src/lib/server/excel/core.ts`; per-entity importers in the
  same folder (`products.ts`, `slug-entity.ts`, `diagnoses.ts`,
  `routine-types.ts`, `routines.ts`); templates in `templates.ts`.
- Shared formula-injection escape: `src/lib/spreadsheet-safe.ts` (client+server).
- Page Server Actions: `src/app/(admin)/admin/<entity>/import-actions.ts`.
- Template download route: `src/app/api/admin/templates/[entity]/route.ts`.
- UI: `src/components/admin/excel-import-dialog.tsx`.
- Two-phase: dry-run preview (no writes) → confirmed commit (one transaction,
  one audit entry). Limits: 10 MB, 5000 rows. Existing identifiers are skipped.
- Routine Type templates intentionally do not expose or import the unused `description` field.

## Seller scanning & searchable selectors

- `src/components/ui/combobox.tsx` + `src/lib/combobox-filter.ts` — searchable
  Combobox (Popover + filtered list) used for diagnosis/routine selection.
- `src/lib/qr-payload.ts` — pure parser accepting a raw token or an AOMI
  `/api/qr/<token>` URL; rejects arbitrary external URLs.
- `src/app/(seller)/seller/assign/_components/qr-scanner-dialog.tsx` — camera
  scanning natively via `BarcodeDetector` API with a lazy-loaded `jsQR` fallback for Safari/iOS; stops all media tracks on success/close/unmount.
- Manual, USB keyboard-wedge, and camera input all funnel through
  `parseQrPayload` → `validateToken`.

---

## Test scripts

| Script | Command | What it tests |
|---|---|---|
| QR import integrity | `npm run test:qr-import` | Import accounting, deduplication, batch creation, concurrency |
| Core correctness | `npm run test:correctness` | Auth, data invariants, Phase 1 |
| API hardening + upload | `npm run test:phase2` | API key guard, upload validation, streaming |
| CSV export streaming | `npm run test:export` | Streaming export chunking logic |
| Replacement rules | `npm run test:replacement-rules` | 14 assertions, cases A–N: stepType invariants, blocking, audit |
| Image management | `npm run test:images` | 14 assertions: magic bytes, MIME gating, sort order, primary image, N+1 avoidance |
| Replacement rule audit | `npm run audit:replacement-rules` | Dry-run — detects pre-existing DB violations, no mutations |
| Catalog pagination | `npm run test:pagination` | `resolvePagination`/`resolvePageSize`/range logic + page wiring |
| Seller comboboxes | `npm run test:combobox` | `filterComboboxOptions` + assign-flow wiring |
| QR payload parser | `npm run test:qr-payload` | raw token / AOMI URL / external / malformed parsing + scanner wiring |
| Keep-alive | `npm run test:keepalive` | endpoint auth/no-store/read-only + workflow YAML (DB optional) |
| Excel imports | `npm run test:excel-import` | parse/preview/commit, templates, relationships, atomic audit (DB optional) |

---

## Critical invariants

1. **Token uniqueness** — `QRToken.token` has a unique DB constraint. Never bypass.
2. **Import accounting** — `totalRows === invalid + skippedDuplicate + inserted` (throws if violated).
3. **Assignment race guard** — `updateMany` with status precondition; reject if count=0.
4. **Activation race guard** — same pattern for ASSIGNED→ACTIVATED.
5. **Package snapshot** — `PackageProduct` rows are a point-in-time snapshot; `productId` is a loose FK by design.
6. **Service key confinement** — `SUPABASE_SERVICE_ROLE_KEY` used only in `src/lib/supabase-server.ts`. Never in client components or `NEXT_PUBLIC_*`. Enforced by `"server-only"` import sentinel.
7. **Batch quantity accuracy** — batch quantity must equal its actual token count after concurrent imports.
8. **Void sync** — voiding a QRToken also sets the linked Package.status to VOIDED in the same transaction.
9. **Replacement stepType invariant** — `ProductReplacement.stepType` must equal both `source.stepType` and `replacement.stepType`. The `addReplacementRule` Server Action derives `stepType` from the source product and rejects any candidate with a different `stepType`. Changing a product's `stepType` is blocked when it has any outgoing or incoming replacement rules. Run `npm run audit:replacement-rules` to detect pre-existing violations.
10. **Primary image** — the primary (display) image for a product is the `ProductImage` row with the lowest `sortOrder`. `reorderProductImages` normalizes sort orders to `0, 1, 2…` on every reorder. The mobile API exposes this as both `imageUrl` and `primaryImageUrl` (both fields are present for backward compatibility).
11. **Package/Token lifecycle sync** — `Package.status` must always match the status of its linked `QRToken`. Transitions happen in the same Prisma `$transaction`.
12. **Audit atomicity** — `writeAuditLog()` accepts an optional Prisma transaction (`tx`) parameter. Callers that need audit records to roll back with the parent operation must pass `tx`. The import and activation flows both do this.

---

## Performance-sensitive queries

| Query | Location | Notes |
|---|---|---|
| Products list primary image | `admin/products/page.tsx` | `images: { take: 1, orderBy: { sortOrder: 'asc' } }` — prevents N+1 |
| QR token list + count | `admin/qr-tokens/page.tsx` | Parallel Phase 1 (4 queries concurrent), then Phase 2 (1 query) |
| Token search | `admin/qr-tokens/page.tsx` | `contains` substring — adequate for current scale; needs `pg_trgm` at ~100k+ |
| CSV export stream | `api/admin/qr-tokens/export/route.ts` | 500-row cursor chunks — avoids full table in memory |
| Replacement candidates | `admin/products/[id]/page.tsx` | Filtered by `stepType` and `active=true` before send |

---

## High-impact files

Reading these files gives ~80% of the system's behavior:

| File | Why important |
|---|---|
| `prisma/schema.prisma` | All models, relations, constraints, indexes |
| `src/lib/server/current-user.ts` | DB-backed auth revalidation used by all auth helpers |
| `src/lib/server/import-qr-tokens.ts` | Full import pipeline with invariants |
| `src/app/(seller)/seller/assign/actions.ts` | Assignment race guard, package creation, and diagnosis integrity |
| `src/app/api/qr/activate/route.ts` | Activation race guard and full side-effect chain |
| `src/app/api/qr/[token]/route.ts` | Mobile token lookup, payload shape, primaryImageUrl |
| `src/lib/auth-helpers.ts` | `requireAuth` / `requireRole` / `requireAnyRole` — used everywhere |
| `src/lib/supabase-server.ts` | Storage client boundary — "server-only" enforced |
| `src/lib/audit.ts` | Audit log writer — accepts optional tx for atomicity |
| `src/lib/server/image-signatures.ts` | Magic-byte MIME detection for uploaded images |

---

## Architecture boundaries

| Boundary | Rule |
|---|---|
| Client/Server | `getSupabaseAdmin()` never imported in client components — `"server-only"` sentinel enforces this |
| Client/Server | Mobile API authentication, server env access, and server image validation also use `"server-only"` sentinels |
| Client/Server | `requireRole()` / `requireAuth()` / `requireAnyRole()` only in Server Actions and Route Handlers |
| Client/Server | `getCurrentUser()` is server-only (reads DB + session) |
| API/Mobile | All `/api/qr/*` routes gated by `checkMobileApiKey()` before any logic |
| Generated code | `src/generated/prisma/` — read-only; regenerated by `npm run db:generate` |
| Migration history | `prisma/migrations/` — append-only; never edit existing files |
| Secrets | `.env` / `.env.local` — never committed; never logged; never in `NEXT_PUBLIC_*` |
| Branding | Only `public/logo/aomiLogo.svg` used in all shell/auth locations — no QR icon |
| Image upload | Server Actions only — no client-to-Supabase direct upload |
| Audit log | Must be inside the same `$transaction` for import and activation flows |

---

## Generated code locations

| Path | How to regenerate |
|---|---|
| `src/generated/prisma/` | `npm run db:generate` (runs `prisma generate`) |
| `graphify-out/graph.json` | `graphify update .` or `/graphify` command |
| `graphify-out/graph.html` | `graphify update .` or `/graphify` command |
| `graphify-out/GRAPH_REPORT.md` | `graphify update .` or `/graphify` command |

Prisma generation is intentionally explicit. There is no `postinstall` script;
Vercel or CI must run `npm run db:generate` before the production build when
generated output is not already present.

---

## Docs index

| File | Contents |
|---|---|
| `AGENTS.md` | Canonical rules for agents (auth, Prisma, invariants, security, git) |
| `CLAUDE.md` | Claude pointer to `AGENTS.md` |
| `docs/CODEBASE_MAP.md` | This file — architecture navigation |
| `docs/API.md` | Mobile REST API specification |
| `docs/SETUP.md` | Local dev setup and env vars |
| `docs/DEPLOYMENT.md` | Vercel + Supabase deployment guide |
| `docs/QR_TOKEN_LIFECYCLE.md` | QR state machine reference with transition table |
| `graphify-out/GRAPH_REPORT.md` | Auto-generated graph report (current: 453 nodes, 417 edges, 142 communities) |

---

## Graphify usage

If `graphify-out/graph.json` exists, query the knowledge graph before broad scans:

```bash
# From the project root — requires graphify installed at /Library/Frameworks/Python.framework/...
graphify query "QR token assignment flow"
graphify path "requireRole" "voidToken"
graphify explain "processQRTokenImport"
```

**When to refresh Graphify:**

- After adding new routes or Server Actions.
- After significant schema or domain model changes.
- After renaming or reorganizing `src/lib/` files.
- After substantial UI shell/component restructuring.

Run `graphify update .` from the project root. The command is cache-assisted and only re-extracts changed files.

Do not refresh for UI-only changes, minor bug fixes, or dependency updates.
