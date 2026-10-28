<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project map and verification

This repository is PlugYard's Next.js App Router / React / TypeScript frontend. Major route families include marketplace, Books/reader, publish/sell, seller Dashboard/inventory/orders/profile/verification, auctions, account/settings/purchases/wishlist, messages/support and legal pages. Typed API clients live in `src/lib/api.ts`, `src/lib/marketplace.ts`, and `src/lib/auth-fetch.ts`; shared navigation and visual components are in `src/components/`. Consult the sibling backend's `docs/ARCHITECTURE_MAP.md` and `docs/PRODUCTION_INFRASTRUCTURE.md` for cross-stack facts.

- `npm run typecheck` runs TypeScript independently of Next's build worker.
- `npm test -- --run --configLoader=native --pool=threads --maxWorkers=1` is the known Windows-compatible Vitest invocation.
- `npm run build` is the production static export. Next worker `spawn EPERM` has occurred on Windows; document any isolated workaround and restore config so test-only switches are never committed.
- Keep `NEXT_PUBLIC_API_URL` set to the production HTTPS API for production builds; do not bake localhost into release output.
- Preserve existing unrelated files and do not clean generated or audit artifacts unless explicitly part of the task.

## PLUGYARD DATABASE — READ BEFORE WORKING

PlugYard's owner has stated that Supabase is no longer the intended production database. Do not automatically assume Supabase is active based on older documentation, commit history, or legacy configuration.

Before database operations:

1. Inspect the active Django database settings.
2. Identify the actual database host without exposing credentials.
3. Verify the current production database infrastructure.
4. Use the verified database for read-only investigations.
5. Back up production data before schema changes.
6. Never change production database connections based solely on old documentation.

If the active configuration still points to Supabase, report the discrepancy rather than silently changing it. Read `../bookstore_backend/docs/PRODUCTION_INFRASTRUCTURE.md` before database-related work; it records what is verified and what remains unverified.

All future AI agents must read this instruction before modifying database-related code.

## Owner request tracking

Before continuing PlugYard work, read the cross-repository source of truth at `../bookstore_backend/docs/PLUGYARD_MASTER_TRACKER.md`, then the latest report at `../bookstore_backend/docs/PLUGYARD_PROGRESS_REPORT.md` and `../bookstore_backend/docs/AGENT_SESSION_CHECKPOINT.md`. Preserve unfinished tasks and distinguish local tests, GitHub sync, deployment, and live verification.
