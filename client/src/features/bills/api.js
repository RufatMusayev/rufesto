// Every Supabase call of the bills feature (tables, RPCs, channels) lives here. Functions return
// { data, error } and never throw; `error` is { code, key } (see errors.js). Names and shapes follow
// sql/42_v2_bills.sql, 42b (bill RPCs), 42c (payments) and 43 (realtime); each call carries a `// CONTRACT:`
// note so a rename in docs/V2-CONTRACT.md is a one-line change.
import { supabase } from '../../lib/supabase'
import { toError } from './errors'
import { mapBill, mapBillRow, mapWaiter, mapIntent, mapSettle, mapReception } from './mappers'

async function call(fn, fallback) {
  try {
    const { data, error } = await fn()
    if (error) return { data: null, error: toError(error, fallback) }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: toError(err, fallback) }
  }
}
const rpc = (name, args, fallback) => call(() => supabase.rpc(name, args), fallback)

function toBill(res) {
  if (res.error) return res
  const bill = mapBill(res.data)
  return bill ? { data: bill, error: null } : { data: null, error: toError({ message: 'bill_not_found' }) }
}

/* -------------------------------------------------------------------- bill */

/** The bill of the table the caller is seated at (opened from the party's unpaid orders on first call). */
export async function openMyBill() {
  // CONTRACT: my_bill() -> bill view-model. Errors: not_authenticated, no_session, nothing_due
  return toBill(await rpc('my_bill'))
}

/** A bill by id: payers, table mates of an active bill, staff. */
export async function getBill(billId) {
  // CONTRACT: bill_detail(p_bill_id) -> bill view-model. Errors: not_authenticated, bill_not_found
  return toBill(await rpc('bill_detail', { p_bill_id: billId }))
}

const ACTIVE_STATUS = ['open', 'requested', 'paying']

/** Where the bill of this table stands on the server, read-only: it never opens one (my_bill does). The bill that
 *  is active now wins; otherwise the newest one made since `since` (the guest's visit start), so a cancelled or
 *  settled bill of this visit shows and one from an earlier visit does not. { id, status } | null. */
export async function tableBillStatus(tableId, since) {
  // CONTRACT: select on bills (SELECT granted to authenticated, RLS: the caller ordered, pays, paid or is seated
  // at the table of an active bill): id, status ('open'|'requested'|'paying'|'settled'|'void'), created_at
  const startedAt = since && !Number.isNaN(Date.parse(since)) ? new Date(since).toISOString() : null
  const base = () => supabase.from('bills').select('id, status, created_at').eq('table_id', tableId)
    .order('created_at', { ascending: false }).limit(1)
  const [active, recent] = await Promise.all([
    call(() => base().in('status', ACTIVE_STATUS)),
    startedAt ? call(() => base().gte('created_at', startedAt)) : Promise.resolve({ data: [], error: null }),
  ])
  if (active.error) return { data: null, error: active.error }
  const row = active.data?.[0] || (recent.error ? null : recent.data?.[0]) || null
  return { data: row ? mapBillRow(row) : null, error: null }
}

export async function listWaiters(tableId) {
  // CONTRACT: list_table_waiters(p_table_id) -> [{ staff_id, first_name, assigned, is_assigned }]
  const { data, error } = await rpc('list_table_waiters', { p_table_id: tableId })
  if (error) return { data: null, error }
  return { data: (data || []).map(mapWaiter), error: null }
}

/** Saves the split plan on the server so table mates see it before anybody pays. Only the table host, the person
 *  who opened the bill and floor staff may call it (anyone else gets not_host). It replans the whole bill, so it
 *  is refused once a share is paid. The default assignment is what the picker offers: every line to whoever
 *  ordered it (own), the food split between everyone seated (equal), the caller pays all (all). */
export async function splitBill({ billId, mode }) {
  // CONTRACT: split_bill(p_bill_id, p_mode 'own'|'equal'|'all', p_assignments '{}') -> bill view-model.
  //   Errors: bill_not_found, not_host, bill_closed, invalid_mode, invalid_assignment, split_locked.
  //   Side effect (sql/42 _plan_bill): the first plan of an open bill makes it 'requested' and notifies staff.
  return toBill(await rpc('split_bill', { p_bill_id: billId, p_mode: mode, p_assignments: {} }, 'split_failed'))
}

/* ---------------------------------------------------------------- payments */

/** One pending payment intent for the caller's share. Calling it again for the same pending share updates the
 *  same intent in place, so a double tap can never create two. `mode` plans the split when none exists. */
export async function createIntent({ billId, tip, tipStaffId, mode }) {
  // CONTRACT: create_payment_intent(p_bill_id, p_method 'demo', p_tip, p_tip_staff_id, p_mode)
  //   -> { intent_id, bill_id, share_id, status, provider, method, amount (share + tip), share_amount, tip_amount }
  const { data, error } = await rpc('create_payment_intent', {
    p_bill_id: billId, p_method: 'demo', p_tip: tip, p_tip_staff_id: tipStaffId || null, p_mode: mode || null,
  }, 'intent_failed')
  if (error) return { data: null, error }
  return { data: mapIntent(data), error: null }
}

/** Settles a DEMO intent (provider 'demo', payer only). No money moves. */
export async function settleDemo(intentId) {
  // CONTRACT: demo_settle_payment(p_intent_id) -> { intent_id, status, bill_id, bill_status, settled,
  //   share_status, loyalty_earned, receipt }
  const { data, error } = await rpc('demo_settle_payment', { p_intent_id: intentId }, 'intent_failed')
  if (error) return { data: null, error }
  return { data: mapSettle(data), error: null }
}

/** Reception path (v2): a pending 'reception' payment intent for the caller's share. Staff see it on the dashboard
 *  Bills page ("Mark paid"), are notified, and the table goes to awaiting_payment. Calling again for the same
 *  pending share updates the same intent. No tip (staff collect at the table). */
export async function requestReception({ billId, mode }) {
  // CONTRACT: create_payment_intent(p_bill_id, p_method 'reception', p_tip 0, p_tip_staff_id null, p_mode)
  //   -> { intent_id, bill_id, share_id, status, provider 'reception', amount, share_amount, tip_amount, split_mode }
  const { data, error } = await rpc('create_payment_intent', {
    p_bill_id: billId, p_method: 'reception', p_tip: 0, p_tip_staff_id: null, p_mode: mode || null,
  }, 'request_failed')
  if (error) return { data: null, error }
  return { data: mapReception(data, mode), error: null }
}

/* ----------------------------------------------------------------- reviews */

/** Dishes of the bill the user may still review: category (for the emoji) and whether a review exists.
 *  reviews has UNIQUE (dish_id, user_id), so a dish reviewed before (any time) cannot be reviewed again. */
export async function dishReviewState(userId, dishIds) {
  if (!dishIds.length) return { data: { categories: {}, reviewed: [] }, error: null }
  const [dishes, mine] = await Promise.all([
    call(() => supabase.from('dishes').select('id, category').in('id', dishIds)),
    call(() => supabase.from('reviews').select('dish_id').eq('user_id', userId).in('dish_id', dishIds)),
  ])
  if (mine.error) return { data: null, error: mine.error }
  // categories only decorate the emoji: a failed dishes read is not fatal
  const categories = {}
  for (const d of dishes.data || []) categories[d.id] = d.category
  return { data: { categories, reviewed: (mine.data || []).map(r => r.dish_id) }, error: null }
}

export async function submitReview({ userId, dishId, rating, body }) {
  // CONTRACT: reviews insert { dish_id, user_id, rating, body }; is_verified is set by the server
  // (trg_review_verify_visit in sql/42d) and comes back in the returned row.
  const { data, error } = await call(() => supabase.from('reviews')
    .insert({ dish_id: dishId, user_id: userId, rating, body: body || null })
    .select('dish_id, is_verified').single(), 'review_failed')
  if (error) return { data: null, error }
  return { data: { dishId: data.dish_id, verified: !!data.is_verified }, error: null }
}

/* ---------------------------------------------------------------- realtime */

let channelSeq = 0

/** Live updates for the bills of one table (a bill opened, requested, paid, cancelled). The filter is the single
 *  table id, so nothing crosses restaurants. Returns an unsubscribe function. */
export function subscribeTableBills({ tableId, onChange }) {
  try {
    const ch = supabase.channel(`bl-table-${tableId}-${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter: `table_id=eq.${tableId}` }, onChange)
      .subscribe()
    return () => { try { supabase.removeChannel(ch) } catch { /* already gone */ } }
  } catch {
    return () => {}
  }
}

/** Live updates for one bill: bills (id), bill_shares + payment_intents (bill_id) and the table row (session
 *  ended). Every filter is a single id, so nothing crosses restaurants. Returns an unsubscribe function. */
export function subscribeBill({ billId, tableId, onChange, onTableEnded, onStatus }) {
  try {
    let ch = supabase.channel(`bl-bill-${billId}-${++channelSeq}`)
    const on = (table, filter, cb, event = '*') => {
      ch = ch.on('postgres_changes', { event, schema: 'public', table, filter }, cb)
    }
    on('bills', `id=eq.${billId}`, onChange)
    on('bill_shares', `bill_id=eq.${billId}`, onChange)
    on('payment_intents', `bill_id=eq.${billId}`, onChange)
    if (tableId) {
      on('tables', `id=eq.${tableId}`, payload => {
        const state = payload?.new?.state
        if (state === 'free' || state === 'cleared') onTableEnded?.()
      }, 'UPDATE')
    }
    ch.subscribe(status => onStatus?.(status))
    return () => { try { supabase.removeChannel(ch) } catch { /* already gone */ } }
  } catch {
    return () => {}
  }
}
