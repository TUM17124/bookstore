## Current access verification ? 2026-10-28 local CLI

The owner authorized this new local CLI session. Effective policy is danger-full-access with approval never. Ordinary SSH resolves to Windows OpenSSH and batch authentication succeeded; GitHub authenticated reads and Chrome DevTools also succeeded. Historical deny-wrapper/access statements below apply to the previous runtime, not this verified session. Never bypass an actual future restriction. See bookstore_backend/docs/LOCAL_SESSION_VERIFICATION_20261028.md (sibling backend from frontend).

Owner requires explicit confirmation before production deployment, database migrations, irreversible financial changes, legal-policy publication or public product publication, regardless of technical approval settings. No such action occurred during verification.

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

The owner most recently confirmed (2026-10-28) that production uses the Supabase PostgreSQL session pooler, with a reported 15-session limit and `EMAXCONNSESSION` errors. An earlier owner statement concerned the intended future provider. This runtime has not independently inspected the active VPS environment. Do not change the production DB URL/provider or increase pool limits as a workaround.

Before database operations:

1. Inspect the active Django database settings.
2. Identify the actual database host without exposing credentials.
3. Verify the current production database infrastructure.
4. Use the verified database for read-only investigations.
5. Back up production data before schema changes.
6. Never change production database connections based solely on old documentation or as a pool-exhaustion workaround.

Read `../bookstore_backend/docs/PRODUCTION_INFRASTRUCTURE.md` before database-related work; it distinguishes owner-confirmed current facts from independent live verification.

All future AI agents must read this instruction before modifying database-related code.

## Owner request tracking

Before continuing PlugYard work, read the cross-repository source of truth at `../bookstore_backend/docs/PLUGYARD_MASTER_TRACKER.md`, then the latest report at `../bookstore_backend/docs/PLUGYARD_PROGRESS_REPORT.md` and `../bookstore_backend/docs/AGENT_SESSION_CHECKPOINT.md`. Preserve unfinished tasks and distinguish local tests, GitHub sync, deployment, and live verification.

## Mandatory session close and access boundary

At session start, read this file, the backend master tracker, progress report and checkpoint; inspect both repository statuses and resume existing work. At session end, update those records with changed files, tests, commit/push/deployment outcomes, live evidence and next actions. Do not mark a task complete from source changes or HTTP status alone.

Preserve unrelated untracked audit artifacts. Production SSH is not available through every agent runtime: this managed Windows runtime resolves `ssh` to a sandbox-deny wrapper before OpenSSH. Do not bypass that wrapper with an absolute executable path; use an owner-authorized terminal when required. The owner-confirmed Oct 28 production reward correction is ledger rows 1/2 (+KES 10 each) offset by row 3 (-KES 20), with balance verified 0.00. Never apply another reversal. Backend migrations 0134/0135 are not confirmed applied.
