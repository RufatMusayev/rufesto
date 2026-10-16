# Demo world simulator (e2e/personas)

Realistic people use the **preview** platform through the same Supabase calls the apps make (PostgREST, RPCs, Storage with a
signed-in user's token; no service key, no SQL). One run = one simulated day. Plain Node (CommonJS), global `fetch`, no new
dependencies. Preview only: it refuses a Supabase URL that is not the preview project, never touches prod and never touches `rqf_*`.

## What a day does

1. **Day one, once** (flag `.world-initialised`): every diner follows 2-5 venues, the friendships (4 clusters + 3 links across; Fərid
   and Mehriban stay alone), each venue manager posts one dish photo, five venues create an active 14-day promo. Steps are
   remembered, so a half-done start is finished by the next run and nothing is posted twice.
2. **6-10 dine-in parties** (weekend more than weekday): coffee shops in the morning (1-2 people), quick dine-ins at lunch (1-3),
   restaurants for dinner (2-5, friends join the same table with chair codes and the host approves). Per party: claim the table,
   1-3 `place_order` rounds of real dishes from the live menu, kitchen starts/readies/finishes each ticket (KDS), waiter serves,
   the host requests the bill (`split_bill`: own / equal / all), each payer pays by demo card with a 5-12 % tip to the table's
   waiter, or at reception where the cashier (else the manager) confirms; everyone leaves, the table is set back to free.
3. **Bookings**: 1-3 a day (Zaur family, Nərmin's group with invited friends, a couple). Created, friends invited and joined,
   confirmed by the restaurant, then moved by the manager to start in 20 minutes (the host can only claim from 30 minutes before the
   start) and seated through `claim_table_from_booking`. One day in 7 a booking is cancelled by the guest, another day in 7 one is
   left confirmed (no-show; the cron marks it once the time shift put it in the past).
4. **After a visit**: 60 % of guests review 1-2 dishes (English / Azerbaijani / Russian, mostly 4-5 stars); posters (Aysel, Səbinə,
   Könül, Kamilla, Ceyhun) share a photo post tagged with venue, dish and visit; Günay saves dishes; at the end of the day friends
   like and comment on 30-60 % of each other's posts and reviews, followers like venue posts.
5. **Venues**: one dish at a random venue is sold out for the day (the kitchen or manager toggles `dishes.available`, switched back
   at the start of the next run); each venue posts with 40 % chance; a new promo now and then (max one active per venue).
6. **End of day sweep**: every bill settled, every ticket finished, every table free. Throttle answers (429, `too_many_*`) are waited
   out; any other error is logged with its step and the day goes on. The last lines are the **day summary** (counts per action, errors per kind).

The plan of a day is seeded by its number (same day, same plan). The actual dishes come from each venue's live menu.

## Run

```bash
# the PM's wrapper: runs the day, then moves every block to its time of day (sim.js -> shift-sql.js -> supabase db query)
bash <scratchpad>/run-sim-day.sh <daysBack>

# the simulator alone (from e2e/)
DEMO_ACCOUNTS=/path/to/demo-accounts.json node personas/sim.js --day 6
node personas/sim.js --day 6 --dry-run        # prints the plan, no network call
```

Flags: `--day N` (days back, required), `--dry-run`, `--parties N` (only the first N parties, for a smoke test), `--no-extras`
(skip posts/promos/cancel/no-show/likes), `--init` (redo day one), `--no-init`, `--pace S` (seconds between kitchen stages, default 0),
`--seed N` (default: the day number).

Inputs: `DEMO_ACCOUNTS` = JSON array `{ kind, id, name, email, password, phone, role?, restaurant? }`; Supabase URL and anon key from
`client/.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, or the same variables in the environment). Diners are matched by first name.

## Files

| File | Role |
|---|---|
| `sim.js` | CLI, day orchestrator, summary |
| `plan.js`, `roster.js`, `rng.js` | the seeded plan of a day; venues, diners, friendships; random numbers |
| `world.js` | config, HTTP, signed-in actors (token store), venues, tables, menus, statistics |
| `dinein.js` | one party: seat, order, kitchen/serve, bill, pay |
| `bookings.js` | booking flows |
| `staff.js` | kitchen board, serving, cashier, tables, close-out and sweep |
| `manager.js` | venue posts, promos, demo-payments check, sold-out toggle |
| `social.js`, `content.js` | follows, friends, reviews, posts, likes, comments; all the texts |
| `init.js` | day one |
| `segments.js`, `shift-sql.js` | time segments of a run; the SQL that moves each block to its intended time (see below) |

## Local state (git-ignored)

`.world-initialised` (day-one steps), `.sim-state.json` (the sold-out dish to switch back), `.tokens.json` (sessions per e-mail:
access + refresh token; never printed). Tokens are reused until 60 s before they expire, then refreshed; the password is only used
when there is no session or the refresh is refused, and only for accounts the day needs. The auth API throttles password sign-ins:
a 429 is waited out (Retry-After, else 30 s doubling up to 5 min).

## Things to know

- `restaurant_settings.demo_payments_enabled` is **SQL-only** (V2-CONTRACT section 4). The sim tries a manager write on day one, expects
  it to be refused, and pays by reception at any venue where it is off (the summary names them). Switch it on with SQL.
- **Time of day.** The sim runs at whatever time it is started, so the run is cut into **segments** (every party with its reviews and
  posts, each reaction block, each venue post, the day-one phases, the sweep). `.sim-segments.json` holds, per segment, the bracket
  in SERVER time (the clock offset is measured at the start from the `Date` header, found to about a tenth of a second by waiting for
  the second to flip; the bracket is padded by 1 s and runs are separated by a 2.5 s pause) and the intended START on the simulated
  Baku date: coffee 08:00-11:00, quick lunches 12:15-14:45, dinners and bookings 19:00-22:15, venue posts 11:00-17:00, day-one
  phases 10:00-18:00, friends' reactions 25-150 minutes after what they react to. `node personas/shift-sql.js <template.sql> > out.sql`
  fills the template's `__SEGMENTS__` with `(n, t0, t1, interval 'N seconds')`, N = t0 minus target (0 when the target is not at least
  10 minutes in the past, e.g. a day-0 run before that time of day). The file is rewritten after every segment.
- A booked party is created, confirmed and moved by the manager to start in 20 minutes inside one segment, so its booking is made
  shortly before the visit. The cancelled and no-show bookings are made 2.5-4 hours before an evening slot, in the afternoon.
- Booking times: the manager's reschedule must lie within the venue's operating hours (the database refuses a booking that ends after
  closing), so the PM widens the hours while the simulation runs. Without that, booked parties walk in at a free table.
- A diner is in one party at a time (claiming a table ends the session elsewhere); nobody eats twice with the same company in a day.
