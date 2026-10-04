@AGENTS.md

# PlugYard frontend — read first

Next.js static export for https://plugyard.com. `next build` writes `out/`, and
nginx serves that from `/var/www/bookstore/out`. There is no Node server in
production. The API is the separate repo `TUM17124/bookstore_backend`
(`https://plugyard.com/api`).

**Full state, deploy runbook, rules and follow-ups:** `docs/HANDOVER.md` here,
and `docs/HANDOVER.md` in the backend repo, which is the master copy.

## Rules (from the owner; non-negotiable)

- **No production changes without explicit approval.** Build, test, push a
  branch, give PR links, STOP. The owner merges and says "go" before each deploy.
- **Stop on anything unexpected.** Back up before anything destructive. Show
  what will be deleted before deleting it.
- **The owner runs every sudo/nginx command**, one at a time.
- **Never print secrets.** Production checks use temporary test data only,
  removed afterwards.

## Working here

- **Checks:**
  - `npx tsc --noEmit -p .`
  - `npx vitest run`: flaky `render-elements` overlay test and auth-fetch
    network test.
  - `npx eslint src`: main already has about 250 problems, so compare your
    changed files with main.
- **Production build:** the repo `.env` holds the production API URL.
  - Run `rm -rf out && npx next build`.
  - Then check that `out/_next/static/chunks` contains no `127.0.0.1` or
    `localhost`.
- **Local build against a local API:**
  - Build with `NEXT_PUBLIC_API_URL=http://127.0.0.1:8001/api npx next build`.
  - Serve with `python -m http.server 3020 --directory out`.
- **Site texts:** the defaults come from the backend. Run
  `python manage.py export_site_texts ../bookstore/src/lib/site-defaults.json`
  after changing `shop/site_content.py`.
- **Feature switches** arrive in `/api/site/config/`:
  - use `useFeature(name)`, which fails open, for normal switches;
  - use `useSignalsOn()`, which fails closed, for Activity signals.
  - Today Ads is OFF and Activity signals is ON.
