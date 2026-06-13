# AOMI Kit QR Manager — Project Instructions

## Source of truth

- This root `CLAUDE.md` is the canonical agent context for this repository.
- Root `AGENTS.md` directs Codex and other agents to read this file.
- Read `docs/CODEBASE_MAP.md` for the detailed architecture map.
- If `graphify-out/graph.json` exists, query Graphify before broad repository scans.
- Graphify and documentation are navigation aids; current source code is authoritative.
- Verify paths, models, and behavior against source before editing.

## Project purpose

AOMI Kit QR Manager manages skincare products, diagnoses, routine templates,
QR-token batches, seller assignment, activation, and mobile retrieval.

Primary roles:

- `ADMIN`: manages catalog, routines, tokens, imports, generation, and status.
- `SELLER`: assigns an available QR token to a routine/package.
- Mobile consumers retrieve or activate kits through token-based API routes.

## Technology stack

- Next.js 16 App Router with React 19 and TypeScript.
- Server Components by default; Client Components only when interactivity requires them.
- Auth.js/NextAuth v5 credentials authentication with JWT sessions.
- Prisma 7 using `@prisma/adapter-pg`.
- PostgreSQL hosted by Supabase.
- Supabase Storage for product images.
- shadcn/ui using the Radix Luma preset `b3ST8r2wy`.
- Tailwind CSS and semantic design tokens.
- Zod for validation.
- Lucide icons.
- npm for package management.

Verify exact dependency versions in `package.json` before version-sensitive work.

## Essential commands

```bash
npm install
npm run dev
npm run lint
npm run build
npm run test:qr-import
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:studio
npx prisma migrate status
```

Do not run destructive database commands without explicit approval.

## Repository map

- `src/app/`: App Router pages, layouts, API routes, and Server Actions.
- `src/app/(admin)/`: ADMIN-only application shell and pages.
- `src/app/(seller)/`: SELLER application shell and assignment flow.
- `src/components/`: shared navigation, authentication, and UI components.
- `src/components/ui/`: shadcn primitives and shared visual components.
- `src/lib/`: auth, Prisma, Supabase, audit, token, and server-domain helpers.
- `src/generated/prisma/`: generated Prisma client; do not hand-edit.
- `prisma/schema.prisma`: authoritative database schema.
- `prisma/migrations/`: committed migration history.
- `prisma/seed.ts`: repeatable seed data.
- `scripts/`: integration/regression scripts.
- `docs/`: setup, API, lifecycle, deployment, and architecture documentation.
- `public/`: static assets.
- `graphify-out/`: generated local knowledge graph when present.

## Important routes

Admin:

- `/admin`
- `/admin/products`
- `/admin/products/[id]`
- `/admin/diagnoses`
- `/admin/routine-types`
- `/admin/routines`
- `/admin/qr-tokens`

Seller:

- `/seller`
- `/seller/assign`

Authentication:

- `/login`
- `/api/auth/[...nextauth]`

QR/mobile API:

- `GET /api/qr/[token]`
- `POST /api/qr/activate`

Inspect the route tree before adding or renaming routes.

## Authentication and authorization

- Authentication is not authorization.
- Enforce role access on the server for every protected mutation and route.
- Reuse existing `requireAuth()`, `requireRole()`, and `requireAnyRole()` helpers.
- All helpers use `getCurrentUser()` (`src/lib/server/current-user.ts`) which re-queries the DB per request — deactivated users are rejected immediately.
- ADMIN mutations must remain ADMIN-only (`requireRole("ADMIN")`).
- SELLER assignment uses `requireAnyRole("SELLER", "ADMIN")` — both roles may use the flow.
- Never rely only on hidden buttons or client-side route guards.
- Do not weaken session, middleware/proxy, or credential validation.
- Do not log passwords, hashes, secrets, tokens, or connection strings.

## Prisma conventions

- Use the generated client from `src/generated/prisma`.
- Follow existing import aliases; do not switch casually to `@prisma/client`.
- Use the shared Prisma instance from `src/lib/prisma.ts`.
- Keep relational writes atomic with transactions where required.
- Preserve unique constraints as the final integrity guard.
- Use `select` when a page needs only a subset of fields.
- Bound large `findMany` queries with pagination.
- Never edit generated Prisma files manually.
- Schema changes require a reviewed Prisma migration.
- Never rewrite or delete existing migration history casually.

## QR-token invariants

- Token values are globally unique.
- A token's original batch ownership is immutable.
- Existing tokens must never be reassigned by import.
- Token status changes must follow the implemented lifecycle.
- Do not arbitrarily edit lifecycle timestamps.
- Do not expose unrestricted status editing.
- Destructive transitions require confirmation and server authorization.
- Preserve audit and activation history.
- Every surviving batch quantity must equal its actual token count.

Current status values must be verified in `schema.prisma` before adding logic.

## QR-token CSV import

- Core import logic lives in the reusable server-only import service.
- The Server Action handles authorization, FormData, UI result, and revalidation.
- Normalize and validate before insertion.
- Count invalid rows separately.
- Skip duplicates within the submitted file.
- Skip tokens already in the database.
- Use the database unique constraint for concurrent-import protection.
- Duplicate-only imports must not create empty batches.
- Mixed imports create a batch containing only newly inserted tokens.
- Never upsert an existing token with update data.
- Preserve this accounting invariant:

```text
totalRows = inserted + skippedDuplicate + invalid
```

Run `npm run test:qr-import` after changing import, token, batch, or lifecycle code.

## Pagination and filters

- QR-token pagination is server-side.
- Allowed page sizes are 50, 100, 500, and 1000.
- Use one canonical Prisma `where` object for table rows and matching count.
- Preserve search, status, batch, and page-size URL parameters.
- Filter changes reset the page to 1.
- The primary count card is filter-aware.
- Secondary status cards are global and labeled accordingly.
- Do not load the complete QR-token table into the browser.

## Product catalog and storage

- Products have SKU, step type, category, description, status, images, and replacements.
- Advanced image and replacement management lives on the product detail page.
- Storage bucket: `product-images`.
- Public read does not mean public write.
- Upload/delete operations must remain server-authorized.
- Enforce allowed MIME types and size limits.
- Never expose the Supabase secret/service key to client code.
- `NEXT_PUBLIC_*` values may be browser-visible; secret values may not.

## Routines

- Routine templates include metadata, routine type, diagnoses, and ordered steps.
- Each step includes order, step type, default product, and instructions.
- Preserve nested validation and transactional update behavior.
- Do not simplify the routine editor by dropping nested fields.
- Maintain deterministic step order.

## UI conventions

- Preserve the shadcn `b3ST8r2wy` design system.
- Use semantic tokens instead of arbitrary color values.
- Use Server Components unless client state is genuinely required.
- Keep Sheets structured as fixed header, scrollable body, fixed footer.
- Keep tables inside bordered responsive surfaces.
- Use horizontal overflow wrappers on narrow screens.
- Icon-only controls require Tooltip and `aria-label`.
- Destructive controls use destructive semantics and confirmation.
- Preserve visible focus states and keyboard navigation.
- Do not reapply the shadcn preset without explicit approval.

## Coding conventions

- Prefer small focused changes over broad rewrites.
- Reuse existing helpers and components before creating abstractions.
- Avoid `any`; use generated Prisma and domain types.
- Validate external input with Zod or established validators.
- Keep server-only secrets and helpers out of Client Components.
- Do not duplicate domain logic in pages, actions, and tests.
- Use clear names instead of explanatory comments for obvious code.
- Add comments only for non-obvious invariants or tradeoffs.
- Do not add production dependencies without justification.

## Documentation and Graphify

- Architecture map: `docs/CODEBASE_MAP.md`.
- Existing operational docs under `docs/` remain the detailed source.
- Prefer Graphify queries over scanning dozens of files.
- Open the exact source files returned by Graphify before changing code.
- Refresh Graphify after major route, schema, or domain restructuring.
- Update `docs/CODEBASE_MAP.md` when architecture changes.
- Do not update architecture docs for cosmetic-only changes.

## Security rules

- Never commit `.env` or `.env.local`.
- Never print complete database URLs or secret values.
- Never place a service-role key in `NEXT_PUBLIC_*`.
- Never trust role, status, IDs, file types, or token values from the client.
- Preserve server authorization and validation.
- Do not disable RLS or storage policies as a shortcut.
- Avoid broad deletion queries in tests.
- Test cleanup must target exact run-specific records.
- Do not run production cleanup from ad hoc scripts.

## Git and change workflow

Before editing:

```bash
git status
git branch --show-current
```

- Do not overwrite unrelated uncommitted changes.
- Use feature branches for substantial work.
- Do not commit or push unless explicitly requested.
- Do not use `git add .` without reviewing changed and untracked files.
- Never force-push `main`.
- Keep generated artifacts and secrets out of commits.

## Verification expectations

For significant changes run:

```bash
npm run lint
npm run build
```

Additionally:

- QR import/lifecycle changes: `npm run test:qr-import`.
- Schema/migration changes: `npx prisma migrate status`.
- Formatting/whitespace: `git diff --check`.
- UI changes: manually inspect relevant desktop and mobile routes.
- Never claim browser testing if browser tooling was unavailable.

## Definition of done

A task is complete only when:

- requested behavior is implemented;
- authorization and invariants remain intact;
- relevant tests pass;
- lint passes;
- production build passes;
- no secrets or temporary files were introduced;
- documentation is updated when architecture changed;
- remaining limitations are reported honestly;
- changes are left uncommitted unless the user requested a commit.
