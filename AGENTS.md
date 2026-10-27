<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

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
