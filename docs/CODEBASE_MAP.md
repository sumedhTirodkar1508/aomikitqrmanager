# AOMI Kit QR Manager — Codebase Map

> Navigation aid for agents and developers. Architecture facts live here; behavioral rules live in `CLAUDE.md`.
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
| Auth | NextAuth v5 beta.31 | JWT strategy, Credentials provider |
| ORM | Prisma 7.8 + `@prisma/adapter-pg` | no URL in `schema.prisma` |
| Database | PostgreSQL (Supabase) | pooler URL for app, direct URL for migrations |
| Storage | Supabase Storage | bucket `product-images`, server-side upload only |
| UI | shadcn/ui (Radix Luma preset `b3ST8r2wy`) | semantic tokens, Tailwind CSS |
| Validation | Zod 4 | used in Server Actions and import |
| CSV parsing | PapaParse | header + flat modes |
| Token generation | nanoid | unambiguous 32-char alphabet |
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
│   └── test-qr-token-import-integrity.ts  # integration test for import invariant
├── src/
│   ├── app/
│   │   ├── layout.tsx         # root layout (font, Toaster)
│   │   ├── page.tsx           # root redirect based on role
│   │   ├── login/page.tsx     # credential login form
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts  # NextAuth handler
│   │   │   └── qr/
│   │   │       ├── [token]/route.ts   # GET — mobile token lookup
│   │   │       └── activate/route.ts  # POST — mobile activation
│   │   ├── (admin)/
│   │   │   ├── layout.tsx             # admin shell (nav, auth guard)
│   │   │   ├── admin/page.tsx         # admin dashboard
│   │   │   ├── admin/products/        # product CRUD + image mgmt
│   │   │   ├── admin/diagnoses/       # diagnosis CRUD
│   │   │   ├── admin/routine-types/   # routine type CRUD
│   │   │   ├── admin/routines/        # routine template CRUD
│   │   │   └── admin/qr-tokens/       # QR token table, generate, import, void
│   │   └── (seller)/
│   │       ├── layout.tsx             # seller shell (auth guard)
│   │       ├── seller/page.tsx        # seller dashboard
│   │       └── seller/assign/         # multi-step assignment flow
│   ├── auth.ts                # NextAuth config (Credentials + bcrypt)
│   ├── auth.config.ts         # edge-safe config (jwt + session callbacks)
│   ├── proxy.ts               # Next.js 16 middleware (route guards)
│   ├── types/next-auth.d.ts   # augments Session/User/JWT with id+role
│   ├── components/
│   │   ├── admin-nav.tsx      # desktop admin sidebar
│   │   ├── admin-mobile-nav.tsx  # mobile admin nav
│   │   ├── auth/              # login-form, logout-button
│   │   └── ui/                # shadcn primitives + custom components
│   ├── lib/
│   │   ├── prisma.ts          # PrismaClient singleton (PrismaPg adapter)
│   │   ├── auth-helpers.ts    # requireAuth(), requireRole()
│   │   ├── supabase-server.ts # getSupabaseAdmin(), productImagePublicUrl()
│   │   ├── mobile-api.ts      # checkMobileApiKey()
│   │   ├── token.ts           # generateToken(), normalizeToken(), isValidTokenFormat()
│   │   ├── audit.ts           # writeAuditLog() — accepts optional tx
│   │   ├── slug.ts            # toSlug()
│   │   ├── utils.ts           # cn() (Tailwind merge)
│   │   └── server/
│   │       └── import-qr-tokens.ts  # processQRTokenImport() service
│   └── generated/prisma/      # generated Prisma client — DO NOT EDIT
├── docs/
│   ├── CODEBASE_MAP.md        # this file
│   ├── API.md                 # mobile REST API reference
│   ├── SETUP.md               # local dev setup
│   ├── DEPLOYMENT.md          # Vercel + Supabase deployment
│   └── QR_TOKEN_LIFECYCLE.md  # state machine reference
├── graphify-out/
│   ├── GRAPH_REPORT.md        # auto-generated knowledge graph report
│   ├── graph.json             # machine-readable graph (gitignored)
│   └── graph.html             # interactive visualization (gitignored)
├── CLAUDE.md                  # canonical agent rules
├── AGENTS.md                  # Codex/other agent entry point
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

### Seller pages (`/seller/*`)

| Route | Page file | Server Actions file |
|---|---|---|
| `/seller` | `seller/page.tsx` | — |
| `/seller/assign` | `seller/assign/page.tsx` | `seller/assign/actions.ts` |

### API routes

| Method | Path | File |
|---|---|---|
| POST | `/api/auth/[...nextauth]` | NextAuth handler |
| GET | `/api/qr/[token]` | `app/api/qr/[token]/route.ts` |
| POST | `/api/qr/activate` | `app/api/qr/activate/route.ts` |
| GET | `/api/admin/qr-tokens/export` | `app/api/admin/qr-tokens/export/route.ts` |

---

## Auth and role flow

```
Request arrives
    │
    ├─► src/proxy.ts  ─── checks session ──► /login (if unauthenticated)
    │                      checks role  ──► / (if wrong role for /admin or /seller)
    │
    ├─► Server Component / Server Action
    │       └── requireAuth()   — throws if no session
    │       └── requireRole("ADMIN") — throws if role mismatch
    │
    └─► API Route (/api/qr/*)
            └── checkMobileApiKey(req) — returns 401/503 if key missing/wrong
```

- `requireAuth()` and `requireRole()` live in `src/lib/auth-helpers.ts`.
- `checkMobileApiKey()` lives in `src/lib/mobile-api.ts`.
- Session data includes `{ id, email, name, role }`. Role is encoded in the JWT.
- Admin Server Actions call `requireRole("ADMIN")` as their first statement.
- Seller Server Actions call `requireAuth()` (role checked implicitly by proxy).

---

## Database schema map

> Full schema in `prisma/schema.prisma`. Summary of key models:

| Model | Key fields | Relations |
|---|---|---|
| `User` | id, email, hashedPassword, role (ADMIN/SELLER) | QRTokenBatch.createdByUserId, QRToken.importedByUserId |
| `Product` | id, name, sku, stepType, category, active | ProductImage[], ProductReplacement[] |
| `ProductImage` | id, productId, imageUrl, imageType (FRONT/SECONDARY/REFERENCE), sortOrder | Product |
| `Diagnosis` | id, name, active | RoutineTemplateDiagnosis[] |
| `RoutineType` | id, name | RoutineTemplate[] |
| `RoutineTemplate` | id, name, routineTypeId, active, durationDays | RoutineTemplateDiagnosis[], RoutineTemplateStep[] |
| `RoutineTemplateDiagnosis` | routineTemplateId, diagnosisId | M:N join |
| `RoutineTemplateStep` | id, routineTemplateId, stepNumber, stepType, defaultProductId | RoutineTemplate, Product |
| `ProductReplacement` | id, stepId, replacementProductId | RoutineTemplateStep, Product |
| `QRTokenBatch` | id, batchName, quantity, source (GENERATED/IMPORTED) | QRToken[] |
| `QRToken` | id, token (unique), batchId, status, assignedAt, activatedAt, voidedAt | QRTokenBatch, Package? |
| `Package` | id, qrTokenId (unique), status, routineTemplateId | QRToken, PackageProduct[] |
| `PackageProduct` | id, packageId, stepNumber, productId (loose FK) | Package |
| `ActivationEvent` | id, qrTokenId, packageId, externalUserId | QRToken, Package |
| `AuditLog` | id, actorUserId, action, entityType, entityId, metadataJson | — |

**Key design decisions:**
- `PackageProduct.productId` is a loose FK (no referential constraint) — deliberate, so product deactivation doesn't cascade-delete assignment history.
- `QRToken` has `@@index([status])` for lifecycle queries.
- `Package` has a unique constraint on `qrTokenId` (one package per token).

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
       │ (replacement flow)
       ▼
   REPLACED (terminal)
```

All status transitions use `updateMany({ where: { id, status: <expected> } })` and check `count === 0` to reject races. See `docs/QR_TOKEN_LIFECYCLE.md` for full table.

---

## Seller assignment flow

Multi-step form in `src/app/(seller)/seller/assign/`:

1. `validateToken(token)` — Server Action: checks token exists + is AVAILABLE. Returns early feedback. **Not trusted** at commit time.
2. `getRoutinesForDiagnosis(diagnosisId)` — Server Action: returns matching active routine templates.
3. `getRoutinePreview(routineTemplateId, diagnosisId)` — Server Action: builds the step list with replacement options.
4. `confirmAssignment(payload)` — Server Action (Zod-validated):
   - `updateMany({ where: { id, status: "AVAILABLE" } })` race guard.
   - Creates `Package` + `PackageProduct[]` snapshot in the same `$transaction`.
   - Throws `TOKEN_TAKEN` if count === 0.

Key files:
- `src/app/(seller)/seller/assign/actions.ts` — all four Server Actions
- `src/app/(seller)/seller/assign/_components/assign-flow.tsx` — client orchestrator

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
  └── $transaction:
        ├── QRTokenBatch.create()
        ├── QRToken.createMany({ skipDuplicates: true })
        ├── delete empty batch if count === 0
        ├── update batch.quantity if concurrent dup reduced count
        └── writeAuditLog(…, tx)

Invariant enforced (throws if violated):
  totalRows === invalid + skippedDuplicate + inserted
```

Test: `npm run test:qr-import` (`scripts/test-qr-token-import-integrity.ts`)

---

## Product image storage flow

Upload path (server-only):

```
browser → multipart FormData → uploadProductImage() Server Action
  │
  ├── requireRole("ADMIN")
  ├── Zod validates imageType enum
  ├── 5MB size guard + MIME type guard
  ├── getSupabaseAdmin().storage.upload(path, buffer)
  └── prisma.productImage.create({ imageUrl, imageType, sortOrder })
```

Delete path:
```
deleteProductImage() → extracts object path from URL → storage.remove() + prisma.delete
```

Storage client: `src/lib/supabase-server.ts` — `getSupabaseAdmin()`. **Never import from a client component.**

---

## Mobile API endpoints

All routes require `x-api-key: <MOBILE_API_KEY>` header. See `docs/API.md` for full spec.

### GET `/api/qr/[token]`

File: `src/app/api/qr/[token]/route.ts`

- Awaits `params` (Next.js 16 async params).
- Returns status-specific JSON: AVAILABLE (minimal), VOIDED/REPLACED (message), ASSIGNED/ACTIVATED (full package payload with steps, products, and image URL).
- No stack traces in error responses.

### POST `/api/qr/activate`

File: `src/app/api/qr/activate/route.ts`

- Idempotent: ACTIVATED tokens return 200 without re-running side effects.
- Race guard: `updateMany({ where: { id, status: "ASSIGNED" } })`.
- On success (inside `$transaction`): sets `QRToken.status = ACTIVATED`, sets `Package.status = ACTIVATED`, creates `ActivationEvent`, writes `AuditLog`.

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
| `validateToken`, `getRoutinesForDiagnosis`, `getRoutinePreview`, `confirmAssignment` | `seller/assign/actions.ts` | `requireAuth()` |

---

## Critical invariants

1. **Token uniqueness** — `QRToken.token` has a unique DB constraint. Never bypass.
2. **Import accounting** — `totalRows === invalid + skippedDuplicate + inserted` (throws if violated).
3. **Assignment race guard** — `updateMany` with status precondition; reject if count=0.
4. **Activation race guard** — same pattern for ASSIGNED→ACTIVATED.
5. **Package snapshot** — `PackageProduct` rows are a point-in-time snapshot; `productId` is a loose FK by design.
6. **Service key confinement** — `SUPABASE_SERVICE_ROLE_KEY` used only in `src/lib/supabase-server.ts`. Never in client components or `NEXT_PUBLIC_*`.
7. **Batch quantity accuracy** — batch quantity must equal its actual token count after concurrent imports.

---

## High-impact files

Reading these seven files gives ~80% of the system's behavior:

| File | Why important |
|---|---|
| `prisma/schema.prisma` | All models, relations, constraints, indexes |
| `src/lib/server/import-qr-tokens.ts` | Full import pipeline with invariants |
| `src/app/(seller)/seller/assign/actions.ts` | Assignment race guard and package creation |
| `src/app/api/qr/activate/route.ts` | Activation race guard and full side-effect chain |
| `src/app/api/qr/[token]/route.ts` | Mobile token lookup and payload shape |
| `src/lib/auth-helpers.ts` | `requireAuth` / `requireRole` — used everywhere |
| `src/lib/supabase-server.ts` | Storage client boundary |

---

## Architecture boundaries

| Boundary | Rule |
|---|---|
| Client/Server | `getSupabaseAdmin()` never imported in client components |
| Client/Server | `requireRole()` / `requireAuth()` only in Server Actions and Route Handlers |
| API/Mobile | All `/api/qr/*` routes gated by `checkMobileApiKey()` before any logic |
| Generated code | `src/generated/prisma/` — read-only; regenerated by `npm run db:generate` |
| Migration history | `prisma/migrations/` — append-only; never edit existing files |
| Secrets | `.env` / `.env.local` — never committed; never logged; never in `NEXT_PUBLIC_*` |

---

## Generated code locations

| Path | How to regenerate |
|---|---|
| `src/generated/prisma/` | `npm run db:generate` (runs `prisma generate`) |
| `graphify-out/graph.json` | `/graphify` command |
| `graphify-out/graph.html` | `/graphify` command |
| `graphify-out/GRAPH_REPORT.md` | `/graphify` command |

---

## Docs index

| File | Contents |
|---|---|
| `CLAUDE.md` | Canonical rules for agents (auth, Prisma, invariants, security, git) |
| `AGENTS.md` | Entry point for Codex and other agents |
| `docs/CODEBASE_MAP.md` | This file — architecture navigation |
| `docs/API.md` | Mobile REST API specification |
| `docs/SETUP.md` | Local dev setup and env vars |
| `docs/DEPLOYMENT.md` | Vercel + Supabase deployment guide |
| `docs/QR_TOKEN_LIFECYCLE.md` | QR state machine reference with transition table |
| `graphify-out/GRAPH_REPORT.md` | Auto-generated graph report (communities, god nodes) |

---

## Graphify usage

If `graphify-out/graph.json` exists, query the knowledge graph before broad scans:

```bash
# From the project root — requires the graphify skill (/graphify in Claude Code)
/graphify query "QR token assignment flow"
/graphify path "requireRole" "voidToken"
/graphify explain "processQRTokenImport"
```

**When to refresh Graphify:**

- After adding new routes or Server Actions.
- After significant schema or domain model changes.
- After renaming or reorganizing `src/lib/` files.

Do not refresh for UI-only changes, minor bug fixes, or dependency updates.
