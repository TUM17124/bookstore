# GigaPDF Real Editor → bookstore: Copy Plan

Read-only audit. Scope turned out much larger than the original "~50 components" framing suggested — see Risk section.

## 1. Route plan

- Real route: `apps/web/src/app/(app)/editor/[id]/page.tsx` (6,405 lines — this single page is a full editor shell, not a thin wrapper) + `layout.tsx`.
- Layout wraps the page in `<AuthGuard>` (`@/components/auth/auth-guard`) and forces `export const dynamic = "force-dynamic"` (cookie-based auth, no static render).
- URL param: `[id]` = `storedDocumentId`, read via `useParams()`. Optional `?page=N` deep link (1-based) applied once pages load.
- Proposed bookstore route: `src/app/tools/pdf-editor/[id]/page.tsx` + `layout.tsx` (reuse PlugYard's own auth guard instead of GigaPDF's `AuthGuard`/cookie auth — swap for PlugYard's JWT check).

## 2. True scope (file counts, this pass)

| Location | Files |
|---|---|
| `apps/web/src/components/editor/` (incl. `lib/`, `__tests__/`) | 126 |
| `apps/web/src/hooks/` | 11 |
| `apps/web/src/lib/` | 41 |
| `packages/types/` | 13 |
| `packages/ui/` | 44 |
| `packages/editor/` | 37 |
| `packages/canvas/` | 31 |
| `packages/api/` | 33 |
| `packages/pdf-engine/` | 80 |
| `packages/logger/` | 11 |
| **Total candidate files** | **~427** |

Not needed: `packages/s3` (13, PlugYard has its own storage), `packages/billing` (17), `packages/embed` (4) — these are GigaPDF SaaS-only.

The editor page alone imports 4 workspace packages as first-class APIs, not incidentally: `@giga-pdf/types` (Element/PageObject/etc.), `@giga-pdf/ui` (a full design-system: Button, DropdownMenu, Sheet, Toast...), `@giga-pdf/editor` (Zustand stores: canvas/selection/UI/operations/view/collaboration, plus table/list/paint-style helpers), `@giga-pdf/api` (TanStack Query mutations for every PDF op, **plus a `socketClient` for real-time multi-user collaboration** — element locks, live cursors, remote-reload-on-binary-update). `@qrcommunication/gigapdf-lib` (the WASM engine) is consumed indirectly through `packages/pdf-engine`, not imported directly by page/component code.

## 3. Vendoring approach — recommended

**Do not cherry-pick individual files.** With ~427 files and 4 packages consumed as whole APIs (stores, full UI kit, full API-mutation surface), file-by-file copying will break constantly on cross-package imports. Recommended: convert `bookstore` into a **pnpm workspace** (it's currently a standalone app — no `pnpm-workspace.yaml`/`turbo.json`) and vendor the needed packages wholesale:

```
bookstore/
  packages/            <- new: copied verbatim from gigapdf/packages/{types,ui,editor,canvas,pdf-engine,api,logger}
  apps/web/            <- current bookstore Next.js app, moved under apps/ (or keep at root, workspace still works with a single app + packages/*)
  pnpm-workspace.yaml  <- new
```

Within each vendored package: strip GigaPDF-SaaS-specific code paths (billing hooks in `packages/api`, tenant/sharing calls) but keep the package structure and internal imports intact — surgically editing 33-80 files per package to remove unwanted calls is far safer than trying to re-derive the packages from scratch.

`packages/api`'s HTTP base URL + `socketClient` connection target are the two places that need to point at Django/PlugYard infrastructure instead of GigaPDF's FastAPI — everything else in that package (the mutation hooks' shapes) should stay as-is so the 126 editor-component files calling them don't need changes.

Then copy `apps/web/src/components/editor/*`, `apps/web/src/hooks/*` (11 files, likely includes `use-document`, `use-document-save`, `use-collaboration`, `use-page-thumbnails` — all editor-specific, safe to copy wholesale), and the relevant subset of `apps/web/src/lib/*` (41 files — needs a follow-up pass to separate editor-relevant lib files from GigaPDF-app-wide ones like billing/tenant helpers) into bookstore's app tree, adapting only: (a) the auth guard/token source, (b) `packages/api`'s base URL, (c) i18n (`next-intl` `useTranslations("editor")` calls throughout — either bring in `next-intl` with an editor-only message bundle, or do a mechanical strip-to-English pass; not resolved here).

## 4. npm dependencies to add (confirmed via package.json diff)

Missing from bookstore entirely — all required: `zustand` (stores), `@tanstack/react-query` (packages/api's mutations), `socket.io-client` (real-time collaboration), `next-intl` (i18n, used throughout the editor tree), `fabric` (`^7.4.0` — canvas rendering, GigaPDF's `packages/canvas` wraps this).

## 5. Risks / unknowns

1. **TypeScript version mismatch**: GigaPDF pins `typescript: ^6.0.3`; bookstore is on `^5`. Not verified in this pass whether GigaPDF's source uses TS6-only syntax that would fail to compile under bookstore's TS5 — check before committing to the vendoring plan, may force a TS5→6 upgrade in bookstore first.
2. **Real-time collaboration is load-bearing, not optional**: element-level soft-locking, live remote-reload-on-binary-update, and a collaboration store are wired into the main editor page's core save/load flow (not a toggle-off feature). Bringing in the editor faithfully means bringing in a socket.io server-side counterpart too — Django/Next.js needs a WebSocket endpoint (GigaPDF's FastAPI likely runs this via its own socket.io server, not yet audited). **This is the single biggest unresolved unknown** — it wasn't scoped in any prior architecture decision and adds a real-time infra requirement beyond REST.
3. `apps/web/src/lib` (41 files) and `components/editor` (126, not the ~50 originally assumed — that count only reflected top-level files, not the `lib/`/`__tests__/` subdirectories) need a follow-up pass to separate editor-only files from app-wide ones before copying.
4. Only ~1,400 of the 6,405-line main editor page was read in this pass; the remaining ~5,000 lines (rendering/toolbar-wiring/mobile-layout logic) weren't inspected — sufficient for a copy *plan* but not yet for writing the actual port.

## 6. Suggested copy order

1. `pnpm-workspace.yaml` + move/restructure bookstore into workspace shape (foundational, everything else depends on it).
2. `packages/types`, `packages/logger` (leaf deps, no internal cross-package imports).
3. `packages/ui` (depends on types).
4. `packages/canvas`, `packages/pdf-engine` (depend on types; pdf-engine wraps the WASM lib).
5. `packages/editor` (stores; depends on types, canvas).
6. `packages/api` (depends on types; this is where Django/PlugYard endpoint + socket URL swaps happen).
7. `apps/web/src/hooks/*`, then `components/editor/*` (depends on all packages above).
8. The route itself (`editor/[id]/page.tsx` + `layout.tsx`), swapping `AuthGuard`/token source for PlugYard's.

Each step should `tsc --noEmit` clean before moving to the next.
