// RPC JSON -> view-models. Screens only know these shapes, so a renamed column or a changed RPC shape is a
// change in this file (and api.js) only. Source of the raw shape: sql/42b_v2_bill_rpcs.sql (_bill_json).
const num = v => Number(v ?? 0) || 0
const numOrNull = v => (v == null ? null : Number(v))

// Server bill status -> view-model status ('settled' is called 'paid' on screen).
const STATUS = { open: 'open', requested: 'requested', paying: 'paying', settled: 'paid', void: 'void' }

function mapItem(i) {
  return {
    lineId: i.line_id ?? null,
    dishId: i.dish_id ?? null,
    name: i.name || '',
    nameI18n: i.name_i18n || {},
    qty: num(i.qty) || 1,
    unitPrice: num(i.unit_price),
    lineTotal: num(i.line_total),
  }
}

function mapPerson(p) {
  return {
    userId: p.user_id,
    name: p.name || '',
    isHost: !!p.is_host,
    isMe: !!p.is_me,
    amountDue: num(p.amount_due),            // what this person ordered (incl. tax, service, credits)
    shareId: p.share_id ?? null,
    shareAmount: numOrNull(p.share_amount),  // what they pay under the chosen split, null before a plan
    shareStatus: p.share_status ?? null,
    paid: !!p.paid,
    items: (p.items || []).map(mapItem),
  }
}

function mapPayment(p) {
  return {
    id: p.id,
    userId: p.user_id,
    name: p.name || '',
    shareId: p.share_id ?? null,
    method: p.method,                        // 'card' | 'reception' | 'cash'
    provider: p.provider,                    // 'demo' | 'reception' | 'cash'
    amount: num(p.amount),                   // share + tip
    tipAmount: num(p.tip_amount),
    status: p.status,                        // 'requires_action' | 'succeeded' | 'failed'
    isDemo: p.provider === 'demo' || !!p.is_demo,
    last4: p.last4 ?? null,                  // never set today: no card data reaches Rufesto
    createdAt: p.created_at ?? null,
  }
}

function mapShare(s) {
  return {
    id: s.id,
    userId: s.user_id,
    name: s.name || '',
    mode: s.mode,
    amount: num(s.amount),
    status: s.status,                        // 'pending' | 'paid' | 'waived'
    paidAt: s.paid_at ?? null,
  }
}

export function mapBill(raw) {
  if (!raw || !raw.id) return null
  const people = (raw.people || []).map(mapPerson)
  // Viewer first, as the server already orders them (kept here so the contract can change).
  people.sort((a, b) => Number(b.isMe) - Number(a.isMe))
  const fiscal = raw.fiscal
    ? { fiscalId: raw.fiscal.fiscal_id ?? raw.fiscal.fiscalId ?? '', qrUrl: raw.fiscal.qr_url ?? raw.fiscal.qrUrl ?? '' }
    : null
  const payments = (raw.payments || []).map(mapPayment)
  return {
    id: raw.id,
    status: STATUS[raw.status] || raw.status,
    splitMode: raw.split_mode || null,
    restaurant: {
      id: raw.restaurant?.id ?? null,
      name: raw.restaurant?.name || '',
      slug: raw.restaurant?.slug || '',
      address: raw.restaurant?.address || '',
    },
    table: { id: raw.table?.id ?? null, label: raw.table?.label ?? '' },
    currency: raw.currency || 'AZN',
    subtotal: num(raw.subtotal),
    tax: num(raw.tax_total),
    service: num(raw.service_total),
    // The only discount source on a v2 bill is redeemed Resto-Credits (sql/42 _bill_build_lines), so the
    // whole discount is shown once, as credits.
    discount: 0,
    creditsApplied: num(raw.discount_total),
    tip: num(raw.tip_total),                 // tips of the shares paid so far
    total: num(raw.total),
    foodTotal: num(raw.food_total),
    people,
    modes: { own: num(raw.modes?.own), equal: num(raw.modes?.equal), all: num(raw.modes?.all) },
    memberCount: num(raw.member_count),
    newOrdersPending: num(raw.new_orders_pending),
    shares: (raw.shares || []).map(mapShare),
    myShare: raw.my_share
      ? { id: raw.my_share.id, amount: num(raw.my_share.amount), status: raw.my_share.status, mode: raw.my_share.mode }
      : null,
    payments,
    myPayments: (raw.my_payments || []).map(mapPayment),
    tips: (raw.tips || []).map(t => ({ userId: t.user_id, amount: num(t.amount), waiterName: t.waiter_name || '' })),
    loyaltyEarned: num(raw.loyalty_earned),
    receipt: raw.receipt ? { id: raw.receipt.id, number: raw.receipt.number, kind: raw.receipt.kind } : null,
    fiscal,
    createdAt: raw.created_at ?? null,
    paidAt: raw.settled_at ?? null,
  }
}

export function mapWaiter(w) {
  return {
    staffId: w.staff_id,
    firstName: w.first_name || '',
    isAssigned: !!(w.is_assigned ?? w.assigned),
  }
}

export function mapIntent(raw) {
  return {
    intentId: raw.intent_id,
    billId: raw.bill_id,
    status: raw.status,
    provider: raw.provider,
    amount: num(raw.amount),
    shareAmount: num(raw.share_amount),
    tipAmount: num(raw.tip_amount),
    splitMode: raw.split_mode || null,
    isDemo: !!raw.is_demo,
  }
}

export function mapSettle(raw) {
  return {
    intentId: raw.intent_id,
    billId: raw.bill_id,
    billStatus: STATUS[raw.bill_status] || raw.bill_status,
    settled: !!raw.settled,
    shareStatus: raw.share_status ?? null,
    loyaltyEarned: num(raw.loyalty_earned),
    receipt: raw.receipt ? { id: raw.receipt.id, number: raw.receipt.number, kind: raw.receipt.kind } : null,
  }
}

// create_payment_intent(..., 'reception') (v2 reception path): the intent amount is the caller's share (tip 0)
export function mapReception(raw, mode) {
  return { amount: num(raw?.amount), mode: raw?.split_mode || mode }
}

/** Dish name in the viewer's language (as components/BillSplit.jsx does). */
export const dishName = (item, lang) => item.nameI18n?.[lang] || item.name
