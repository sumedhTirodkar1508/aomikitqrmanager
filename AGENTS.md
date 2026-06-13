# AOMI Kit QR Manager — Agent Entry Point

## Required context

Before doing any work, read the complete root file:

- [CLAUDE.md](./CLAUDE.md)

@CLAUDE.md

`CLAUDE.md` is the canonical project-context and engineering-instructions file for this repository.

Then read only the relevant sections of:

- [Codebase map](./docs/CODEBASE_MAP.md)
- [README](./README.md)
- other task-relevant files under `docs/`

If `graphify-out/graph.json` exists, prefer Graphify queries for initial navigation instead of broadly reading the repository. Verify Graphify results against current source code before editing.

## Core rules

- Inspect `git status` before making changes.
- Preserve authentication, authorization, domain invariants, and API contracts.
- Never expose secrets or print complete environment values.
- Do not modify generated Prisma files.
- Schema changes require proper migrations.
- Do not use broad destructive database cleanup.
- Do not reapply the shadcn preset without explicit approval.
- Do not commit or push unless explicitly requested.
- Make focused changes and avoid unrelated refactors.

## Verification

For significant changes run:

```bash
npm run lint
npm run build
```

Also run when relevant:

```bash
npm run test:qr-import
npx prisma migrate status
git diff --check
```

Do not claim manual browser testing unless it was actually completed.

## Documentation

Update `docs/CODEBASE_MAP.md` only when architecture, routes, domain flows, or major dependencies change.

Refresh Graphify after substantial structural changes.
