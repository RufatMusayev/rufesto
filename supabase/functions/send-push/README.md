# send-push

Delivers one `notifications` row as a Web Push message to every subscribed device of its recipient
(`docs/V2-CONTRACT.md` section 21.3).

```
INSERT into notifications
  -> AFTER INSERT trigger (sql/64b, pg_net)         only if push_enabled, a subscription of that audience, not in quiet hours
  -> POST <project_url>/functions/v1/send-push      { "notification_id": "<uuid>" }  +  header  x-push-secret
  -> this function: load row + recipient prefs/language -> render az/en text -> web-push to each subscription
```

- POST only. `x-push-secret` is compared in constant time with env `PUSH_WEBHOOK_SECRET`; mismatch gives `401`, other methods `405`.
- After that it always answers `200` with a small summary: `{ ok, sent, removed, failed }`, or `{ ok:false, reason }` / `{ ok:true, sent:0, skipped }`. No error detail is returned (the platform log has a clipped message: HTTP status plus a short reason, never endpoints, keys or payloads).
- Language: `notification_prefs.language` -> `customer_profiles.preferred_language` -> `az`. `en*` is English, `ru*` is Russian, everything else is Azerbaijani. Russian wording avoids gendered verbs where the person is unknown ("Айсель: нравится ваш пост").
- Message JSON (what `sw.js` receives): `{ title, body, url, tag, icon, badge }`. `tag` = `group_key` or the type, so a phone replaces instead of stacking. `url` is always an absolute link on `CONSUMER_ORIGIN` (guest rows) or `DASHBOARD_ORIGIN` (staff rows); the path is built only from ids in the payload, never from a payload URL.
- TTL 3600 s. Urgency `high` for `order_ready`, `waiter_called`, `bill_requested`, `join_request`, `normal` for the rest.
- Never pushed: a `friend_request` whose payload has a `status` (accepted | declined | cancelled) answers `{ ok:true, sent:0, skipped:"not_pushable" }`.
- Per subscription: success sets `last_ok_at` and resets `fail_count`; `404` / `410` deletes the subscription; any other failure adds 1 to `fail_count`.
- Wording mirrors the in-app inbox (`client/src/lib/notificationView.js`, `client/src/locales/{en,az}/notifications.json`) for all 26 types: `promotion bill_requested bill_paid waiter_called join_request join_approved join_declined booking_created booking_confirmed booking_cancelled booking_no_show booking_invite booking_member_joined booking_seated booking_reminder bill_settled friend_request friend_accepted post_like post_comment review_like review_reply order_ready place_post review_received stock_alert`. Staff types are worded for staff and open the dashboard (`/bills?table=`, `/waiter`, `/bookings`, `/menu`, `/tables`). Table number, restaurant name and actor first name are looked up when the payload lacks them. An unknown type gets "System notification." and a legacy plain-text payload is shown as text; JSON is never printed.
- Files: `index.ts` (handler), `render.ts` (pure text and target, no imports), `deno.json` (import map).

## Environment

| Name | Where it comes from |
|---|---|
| `PUSH_WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CONSUMER_ORIGIN`, `DASHBOARD_ORIGIN` | `supabase secrets set --env-file push.env` (file made by `scripts/push-keys.mjs`) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | injected by Supabase, nothing to set |

`CONSUMER_ORIGIN` / `DASHBOARD_ORIGIN` default to the preview origins (`https://rufat-server.com`, `https://resto.rufat-server.com`) when unset; set them for production.

Icons: the push carries `<origin>/icons/icon-192.png` and `<origin>/icons/badge-72.png`. Both apps must serve those two files from `public/icons/` (a missing file only means no icon, not a failed push).

## Setup, step by step (PM)

Project ref: preview `qqwvtuckljwvwrvyrjbn`. Run from the repo root in PowerShell. `<scratchpad>` is
`C:\Users\musay\AppData\Local\Temp\claude\C--Users-musay-Desktop-claude\9308ea1d-0f9a-4965-b895-2223492297b4\scratchpad`.

```powershell
# 1. Make the keys (prints only "written" and the public key; refuses to overwrite an existing push.env, --force rotates)
node scripts/push-keys.mjs

# 2. Set the function secrets from that file (values are not echoed)
npx supabase@latest secrets set --env-file <scratchpad>\push.env --project-ref qqwvtuckljwvwrvyrjbn

# 3. Deploy the function (the database calls it with the shared secret, so no JWT check)
npx supabase@latest functions deploy send-push --project-ref qqwvtuckljwvwrvyrjbn --no-verify-jwt

# 4. Store the same webhook secret and the project URL in Vault for the trigger, then delete the SQL file (it contains the secret)
node scripts/push-vault-sql.mjs
npx supabase@latest db query --linked -f <scratchpad>\push-vault.sql
Remove-Item <scratchpad>\push-vault.sql

# 5. Apply sql/64_notifications_v2.sql, then sql/64b_push.sql (the trigger reads the two Vault secrets at run time).
```

`scripts/push-vault-sql.mjs` options: `--env <push.env>`, `--out <file.sql>`, `--project-ref <ref>` or `--project-url <url>` (production: pass its ref). It takes only `PUSH_WEBHOOK_SECRET` from the env file.

The public key goes to both apps as `VITE_VAPID_PUBLIC_KEY` (value in `<scratchpad>\push-public.env`; it is not secret). It must be passed through like `VITE_SUPABASE_ANON_KEY`: `.env.preview` / `.env.prod`, `docker-compose.yml` build args and `Dockerfile.web` ARG/ENV, plus `client/.env` and `client-resto/.env` for local dev.

Rotating keys (`push-keys.mjs --force`) invalidates every existing browser subscription: redo steps 2 and 4, rebuild both apps with the new public key, and users switch push off and on again.

## Smoke test after deploy

```powershell
# no secret -> 401
curl.exe -s -i -X POST https://qqwvtuckljwvwrvyrjbn.supabase.co/functions/v1/send-push -d '{}'

# with the secret read from the env file (not printed; the backslashes are for Windows PowerShell 5.1) and an id that does not exist -> 200 {"ok":true,"sent":0,"skipped":"not_found"}
$s = ((Get-Content <scratchpad>\push.env | Where-Object { $_ -like 'PUSH_WEBHOOK_SECRET=*' }) -replace '^PUSH_WEBHOOK_SECRET=', '')
curl.exe -s -X POST https://qqwvtuckljwvwrvyrjbn.supabase.co/functions/v1/send-push -H "x-push-secret: $s" -d '{\"notification_id\":\"00000000-0000-4000-8000-000000000000\"}'
```

A real end-to-end check needs a subscribed browser: turn on "Push notifications on this device" in the app, then call a waiter / send a friend request from another account. Logs: Supabase dashboard -> Edge Functions -> send-push -> Logs.

## Tests run before this was handed over

- `node scripts/push-render-test.mjs`: all 26 types x az/en/ru render with no placeholder left, correct origin and target, escapes and fallbacks.
- `npx deno check index.ts render.ts`: type-checks clean (Deno 2.9).
- Local end-to-end under Deno against a mock PostgREST and a mock push service: 401/405/bad body paths, constant-time secret check, real `web-push` encryption (aes128gcm + VAPID), TTL and urgency headers, payload decrypted and equal to the expected JSON, 410 deletes the subscription, 500 bumps `fail_count`, success sets `last_ok_at`.
- Not tested: delivery to a real browser push service (needs the deployed function and a real subscription).
