# PlugYard frontend — handover (2026-10-04)

The master handover is `docs/HANDOVER.md` in the backend repo
(`TUM17124/bookstore_backend`). It covers the architecture, the standing
rules, deploys, switches and follow-ups. This page covers what is specific
to the frontend.

## What is live

- Main `1b023db`, the same tree as the deployed `6edead5`. Built and swapped
  on 2026-10-04 at 09:04:59 server time.
- Rollback build: `/var/www/bookstore/out_old_ads`.
- nginx serves only `/var/www/bookstore/out`. The old git checkout and loose
  files at the top of `/var/www/bookstore` are not used; see the backend
  follow-ups.

## Deploy (frontend part)

1. Build from merged main with the production `.env`:
   - `rm -rf out && npx next build`;
   - check that `out/_next/static/chunks` has no local addresses.
2. Package and upload:
   - `tar czf out_<name>.tgz -C out .`;
   - `scp` it to `~` on the server;
   - compare the SHA-256 on both ends.
3. Swap on the server, keeping the previous build:
   ```bash
   cd /var/www/bookstore
   [ ! -e out_old_<name> ]
   rm -rf out_new && mkdir out_new && tar xzf ~/out_<name>.tgz -C out_new
   mv out out_old_<name> && mv out_new out
   ```
4. Clean up: keep `out` plus the most recent `out_old_*`, and delete the
   uploaded tarball.
5. SEO texts and site-text defaults are baked in at build time. An admin
   change to them needs a new build.

## Pieces worth knowing

- **Ads (Part E):**
  - Dashboard tab: `src/app/dashboard/ads-tab.tsx` and `ad-stats.tsx` (SVG
    charts, no chart library).
  - Sponsored cards: the badge, viewability (50% visible for 1 s) and click
    events live in `GridBookCard` (`src/components/ui/books-showcase.tsx`).
  - API calls: `sendAdEvent`, `getAdStats`, `downloadAdStatement` in
    `src/lib/api.ts`.
- **Activity signals:**
  - `queueSignal` in `src/lib/api.ts` batches events and sends them every
    5 seconds and when the page hides.
  - `useReadingTime` (`src/hooks/use-reading-time.ts`) is used in the PDF
    reader and the audio player.
  - Both send nothing unless the backend switch is on (`useSignalsOn`).
  - A book opened from a sponsored slot never feeds organic trending.
- **Preload:** `src/lib/preload.ts` is an inline script that starts the
  sections and banners requests before React loads, sending the browser's
  visitor id.
- **Visitor id:** `plugyard_vid` in `localStorage` (`src/lib/visitor.ts`). It
  is sent as `X-Visitor-Id` for banners, sections, search, ads, checkout and
  signals.
