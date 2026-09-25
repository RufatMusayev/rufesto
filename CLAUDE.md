# Rufesto

Restaurant discovery + dine-in platform: consumers discover, book, sit via table code/QR, order, pay; restaurants run orders, KDS, tables, menu, promos, bookings. Real-time via Supabase.

## Layout
- `client/` — consumer SPA (React 18 + Vite, :5173)
- `client-resto/` — restaurant dashboard SPA (:5174)
- `shared/` — helpers + constants used by both (`@shared` alias)
- `server/` — legacy Express API (:3001, service-role key); **neither SPA calls it**
- `sql/` — migrations (`NN_name.sql`) + `_prod_baseline*.sql`
- `nginx/`, `Dockerfile.web`, `docker-compose.yml` — deploy

## Commands
- `npm run install:all` · `npm run dev` (all three) · `npm run build`
- Local `.env` files point at the **preview** Supabase project.

## Environments
| | Preview | Production |
|---|---|---|
| Domains | rufat-server.com, resto.rufat-server.com | rufesto.com, resto.rufesto.com |
| Docker | `p_rufesto` :8080 | `r_rufesto` :8090 |
| Supabase | `qqwvtuckljwvwrvyrjbn` | `bjohnoaezfmrgunvjixt` |
Always ship to preview first, confirm, then promote (`/deploy-rufesto`).

## Must know
- Both SPAs talk **directly** to Supabase with the anon key → **RLS + grants + triggers are the only security boundary**. Never trust the browser for prices, statuses, totals or roles.
- The preview DB also hosts an unrelated project (`rqf_*` tables — Ryan's Quick Fix). Don't touch them.
- Read `docs/DATABASE.md` §9 before touching auth, tables, orders or RLS. The repo is public: don't commit `docs/` or describe open security issues in commits until they're fixed.

## Reference docs (read the relevant one, not all)
- `docs/ARCHITECTURE.md` — start here: system map, feature flows, top issues
- `docs/DATABASE.md` — every table, function, trigger, policy, storage, realtime
- `docs/CLIENT_CONSUMER_APP.md`, `docs/CLIENT_RESTO_DASHBOARD.md` — every page/component/function
- `docs/SERVER_INFRA_SQL.md` — Express, Docker/nginx, sql files, git history
- `docs/API_KEYS_AND_SECRETS.md` — key inventory + fix plan
