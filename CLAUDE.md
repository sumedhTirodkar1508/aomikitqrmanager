## 1. Read first

* This root `CLAUDE.md` is the canonical instruction file for every coding agent.
* Root `AGENTS.md` must direct agents here before any work begins.
* Read `docs/CODEBASE_MAP.md` for detailed architecture, routes, models, flows, and high-impact files.
* Read only task-relevant files under `docs/`.
* If `graphify-out/graph.json` exists, use Graphify for initial navigation instead of broad scans.
* Graphify and docs are navigation aids; current source code is authoritative.
* Verify paths, models, and behavior against source before editing.

## 2. Project overview

AOMI Kit QR Manager is a Next.js application for:

* Admin catalog management: products, diagnoses, routine types, routines, images, and replacement rules.
* QR-token generation, import, export, filtering, lifecycle control, and audit history.
* Seller assignment of available tokens to diagnosis-specific routines and product packages.
* Mobile API lookup and activation of assigned kits.
* Separate Excel templates/importers per catalog page.
* Manual, USB-scanner, and camera token entry.
* Supabase Storage product images and a GitHub Actions keep-alive workflow.

Roles:

* `ADMIN`: catalog, routines, imports, tokens, status, and reporting.
* `SELLER`: seller dashboard and QR assignment.
* Both roles may use seller assignment where existing server helpers allow it.

## 3. Stack

Next.js 16 App Router, React 19, TypeScript, Auth.js/NextAuth v5 Credentials,
JWT sessions with a 12-hour maximum age, Prisma 7 with `@prisma/adapter-pg`,
PostgreSQL on Supabase, Supabase Storage, Tailwind CSS v4, shadcn/ui Radix Luma
preset `b3ST8r2wy`, Zod, Lucide icons, and npm.

Verify exact versions in `package.json` before version-sensitive work.

## 4. Work mode

Before editing:

```bash
git status
git branch --show-current
```

* Work only in this repository and stay on the current branch.
* Do not create/switch branches unless explicitly requested.
* Do not overwrite unrelated uncommitted changes.
* Do not commit, push, merge, or open a PR unless explicitly requested.
* Do not run destructive Git or database commands without approval.
* Review changed and untracked files before staging.
* Make focused changes; avoid unrelated refactors.
* Do not perform browser automation unless explicitly requested.
* The user performs manual browser QA; provide clear manual test steps.
* Never expose secrets, full environment values, passwords, tokens, or connection strings.

## 5. Repository map

* `src/app/`: pages, layouts, Route Handlers, Server Actions.
* `src/app/(admin)/` and `src/app/(seller)/`: role-specific shells and flows.
* `src/components/` and `src/components/ui/`: shared components and shadcn primitives.
* `src/lib/`: auth, Prisma, Supabase, audit, token, pagination, Excel, scanner, server helpers.
* `src/generated/prisma/`: generated client; never hand-edit.
* `prisma/schema.prisma`: authoritative schema; `prisma/migrations/`: migration history.
* `scripts/`: regression/integration scripts; `docs/`: detailed documentation.
* `graphify-out/`: generated graph/report.

## 6. Auth and database rules

* Authentication is not authorization; enforce access on the server.
* Reuse `requireAuth()`, `requireRole()`, and `requireAnyRole()`.
* These use `getCurrentUser()`, which re-queries the DB and rejects inactive/deleted users immediately.
* ADMIN mutations stay `requireRole("ADMIN")`; seller assignment stays `requireAnyRole("SELLER", "ADMIN")`.
* Never rely only on hidden buttons or client guards.
* Preserve session expiry, DB revalidation, proxy/middleware, and credential validation.
* Use the shared Prisma instance from `src/lib/prisma.ts`.
* Import generated Prisma code from `src/generated/prisma`; do not casually switch to `@prisma/client`.
* Use transactions for related writes and audit records; preserve unique constraints as final integrity guards.
* Paginate large queries; do not load complete tables into the browser.
* Schema changes require reviewed migrations.
* Never edit generated Prisma files or rewrite migration history casually.
* Tests clean up only exact, run-specific records.

## 7. Domain invariants

### QR tokens and imports

* Token values are globally unique; generated values use `PREFIX-XXXXXX` with secure randomness.
* Existing/imported formats remain valid; never rewrite persisted tokens.
* Original batch ownership is immutable; imports never update or reassign existing tokens.
* Preserve lifecycle transitions, timestamps, activation history, and audit history.
* Every surviving batch quantity equals its actual token count.
* Duplicate-only imports create no batch; mixed imports batch only new tokens.
* Preserve `totalRows = inserted + skippedDuplicate + invalid`.
* Run `npm run test:qr-import` after related changes.

### Pagination

* Catalog pages use server-side pagination through `resolvePagination()` and `DataPagination`.
* Preserve filters/query params and deterministic ordering with an `id` tiebreaker.
* QR sizes: 50, 100, 500, 1000; catalog sizes: 25, 50, 100.
* QR filters reset page to 1; primary count is filtered, secondary status cards remain global.
* Run `npm run test:pagination`.

### Excel imports

* Each catalog page has its own template/importer; never combine them.
* Use `exceljs`, not SheetJS.
* Keep dry-run preview separate from confirmed commit.
* Commit re-parses/revalidates, writes valid new rows transactionally, and creates one audit entry.
* Existing SKU/slug/name identifiers are skipped, never overwritten.
* Preserve 10 MB/5000-row limits, formula rejection, and spreadsheet-injection escaping.
* Run `npm run test:excel-import`.

### Seller assignment and scanning

* Diagnosis and routine selection use the searchable Combobox.
* Changing diagnosis clears routine, preview, products, and validation state.
* Validate final diagnosis/routine/product choices again on the server.
* Manual, USB keyboard-wedge, and camera scans feed the same parser/validation path.
* Stop camera tracks on success, close, and unmount; keep manual fallback.
* Run `npm run test:combobox` and `npm run test:qr-payload`.

### Replacement rules and images

* Source and replacement products must share the same step type.
* Derive step type from the source product; never trust form input.
* Block step-type changes while incoming/outgoing replacement rules exist.
* Run `npm run test:replacement-rules` and `npm run audit:replacement-rules`.
* Product upload/reorder/delete stays server-authorized.
* Validate real file signatures, size, and formats.
* Primary image is lowest `sortOrder`; reorder normalizes to `0,1,2...`.
* Avoid N+1 image queries; keep Supabase service credentials server-only.
* Run `npm run test:images`.

### Keep-alive

* `POST /api/internal/keepalive` performs read-only `SELECT 1`.
* Authenticate with `x-keepalive-key` using timing-safe comparison.
* Never log the key or expose DB credentials to GitHub Actions.
* Preserve generic 200/401/503 responses and `Cache-Control: no-store`.
* Run `npm run test:keepalive`.

## 8. UI conventions

* Preserve the existing shadcn/Radix Luma design system and use existing shadcn components.
* Prefer searchable Combobox/Command patterns for long dropdowns.
* Use semantic tokens, not arbitrary colors; do not reapply the preset without approval.
* Keep Sheets with fixed header, scrollable body, fixed footer.
* Keep tables in bordered responsive surfaces with narrow-screen overflow.
* Icon-only controls require Tooltip and `aria-label`.
* Destructive actions require destructive styling, confirmation, and server authorization.
* Preserve keyboard navigation, focus states, reduced motion, and responsiveness.
* Avoid broad redesigns for focused UI requests.

## 9. Security and server-only boundaries

* Privileged modules reading secrets or enforcing server validation import `"server-only"`.
* Keep privileged helpers unreachable from Client Components.
* Extract pure helpers when standalone tests need shared logic.
* Never place service-role or secret keys in `NEXT_PUBLIC_*`.
* Never trust client role, status, IDs, MIME type, token value, or step type.
* Do not disable RLS/storage protections as a shortcut.
* Do not add in-memory rate limiting to serverless code.
* Do not add production dependencies without justification.

## 10. Verification

For significant changes:

```bash
npm run lint
npm run build
npx tsc --noEmit
git diff --check
```

Run only relevant suites:

* QR/import/lifecycle: `npm run test:qr-import`, `npm run test:correctness`.
* API/security/export: `npm run test:phase2`, `npm run test:export`.
* Replacement/images: `npm run test:replacement-rules`, `npm run test:images`.
* Pagination/search/scanning: `npm run test:pagination`, `npm run test:combobox`, `npm run test:qr-payload`.
* Keep-alive/Excel: `npm run test:keepalive`, `npm run test:excel-import`.
* Schema: `npx prisma validate`, `npx prisma migrate status`.

State what was and was not run. Never claim browser testing when it was not performed.

## 11. Documentation and Graphify

* Use `docs/CODEBASE_MAP.md` for detailed architecture.
* Use Graphify first for structural navigation, then open current source files.
* Update the map only when routes, models, flows, boundaries, or major dependencies change.
* Refresh Graphify after substantial structural changes, not cosmetic edits.
* Keep operational detail in task-specific docs instead of growing this file indefinitely.

## 12. Completion report

End significant work with:

1. What changed.
2. Exact files changed.
3. Important design decisions and preserved invariants.
4. Authorization and validation behavior.
5. Tests added or updated.
6. Verification commands and actual results.
7. Manual browser checks for the user.
8. Known limitations, risks, or deferred work.
9. `git diff --stat`.
10. `git status --short`.

Be factual. Do not claim tests, builds, migrations, or browser checks not completed.

## 13. Definition of done

A task is complete only when requested behavior is implemented, authorization and
domain invariants remain intact, relevant checks pass, no secrets or temporary
files were introduced, architecture docs are updated when needed, manual QA and
remaining limitations are reported, and changes remain uncommitted unless the
user explicitly requested otherwise.