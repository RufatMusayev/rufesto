# WP3 bills: notes for the integrator

**Routes** (`routes.jsx`, public; each screen shows a sign-in card when signed out, so keep `/pay/:billId` and `/receipt/:billId` free of auth redirects): `/bill`, `/bill/:billId`, `/pay/:billId` (BillPage), `/receipt/:billId` (ReceiptPage).
- `App.jsx`: `import billsRoutes from './features/bills/routes'` and `{billsRoutes}` inside `<Route element={<AppLayout />}>`.
- `lib/i18n.js`: `import billsEN from '../locales/en/bills.json'` (same for az) and `bills: billsEN` / `bills: billsAZ` in `resources` (optional: `features/bills/i18n.js` also self-registers).
- Nav: none (`nav.js` exports `[]`). CSS: `styles.css` (prefix `bl-`), imported by routes.jsx and mounts.js.

**Mounts** (`import { BillEntry, ReceiptLink, ReviewPrompt } from '../features/bills/mounts'`):
1. `TablePage.jsx`: delete the `PaymentSheet` import, the `showPayment` state and the `{showPayment && ... <PaymentSheet/>}` block; replace the "Request bill" `<button>` block (line ~434) with `{allServed && orders.length > 0 && <BillEntry total={sessionTotal} />}`. Drop `!paymentState` from that condition: the v2 split sets the table to `awaiting_payment`, which TablePage maps to `paymentState`, and the entry would vanish mid-payment.
2. `ProfilePage.jsx` Orders cards (optional): `<ReceiptLink billId={...} />`. Orders carry no bill id today (`bill_lines.order_id` has it), so this needs a lookup.
3. `ReviewPrompt({ billId })` is already used inside both pages; no other mount needed.

**Backend facts / mismatches handled in `api.js` + `mappers.js`**
- Server bill status `settled` is `paid` in the view-model; the only discount source is Resto-Credits, shown once as "Resto-Credits".
- Reception uses the legacy `request_table_bill(table, 'reception', mode)` as specified. It creates no v2 payment intent and leaves the v2 bill `open` (table goes `awaiting_payment`), so WP4's per-share "Mark paid" will not see it; staff use "Mark whole bill paid". To make reception a v2 intent, replace the body of `requestReception` with `rpc('create_payment_intent', { p_bill_id, p_method: 'reception', p_tip: 0, p_tip_staff_id: null, p_mode })` (it also notifies staff and moves the table).
- `reviews` has UNIQUE (dish_id, user_id): ReviewPrompt never offers a dish with any earlier review (spec said last 24h) and maps a 23505 to a translated message.
- `demo_disabled` (restaurant_settings.demo_payments_enabled = false, sql 42/42c re-run): learned only from the error, so the Card (demo) row is hidden, the guest is switched to reception and sees a translated message; no extra read needed.
- Equal splits: the caller's share can be 1 qepik above `modes.equal`; if the intent amount differs from what was shown, nothing is settled, the new amount is shown and the guest taps again (same intent, never a second one).

**RPCs used** (all exist on preview, run as the QA guest in a rolled-back transaction 2026-10-02): `my_bill`, `bill_detail`, `list_table_waiters`, `create_payment_intent`, `demo_settle_payment`, `request_table_bill`; tables `reviews`, `dishes`; realtime `bills`, `bill_shares`, `payment_intents` (filter by id), `tables` (id). Nothing assumed is left unconfirmed.
