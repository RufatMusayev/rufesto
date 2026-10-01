// Every Supabase call of the bills feature (tables, RPCs, channels) lives here. Functions return
// { data, error } and never throw; `error` is { code, key } (see errors.js). Names and shapes follow
// sql/42_v2_bills.sql, 42b (bill RPCs), 42c (payments) and 43 (realtime); each call carries a `// CONTRACT:`
// note so a rename in docs/V2-CONTRACT.md is a one-line change.
import { supabase } from '../../lib/supabase'
import { toError } from './errors'
import { mapBill, mapWaiter, mapIntent, mapSettle, mapReception } from './mappers'

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

export async function listWaiters(tableId) {
  // CONTRACT: list_table_waiters(p_table_id) -> [{ staff_id, first_name, assigned, is_assigned }]
  const { data, error } = await rpc('list_table_waiters', { p_table_id: tableId })
  if (error) return { data: null, error }
  return { data: (data || []).map(mapWaiter), error: null }
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
