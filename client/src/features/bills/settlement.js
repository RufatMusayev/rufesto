import { addMoney } from './money'

/**
 * The bill as it stands right after MY demo payment, built from what the two RPCs answered (create_payment_intent,
 * demo_settle_payment) on top of the latest bill the screen holds. The screen shows "Payment received" from this at
 * once instead of waiting for a realtime event that may never arrive (WebSocket up but silent) or for a re-read
 * that can fail; the server's own copy replaces it as soon as a read succeeds (reload, poll, realtime).
 * Returns the bill unchanged when there is nothing to build from.
 */
export function applySettlement(bill, { intent, settle } = {}) {
  if (!bill || !intent || !settle) return bill
  const me = bill.people.find(p => p.isMe) || null
  const shareId = intent.shareId ?? bill.myShare?.id ?? null
  const settled = !!settle.settled || settle.billStatus === 'paid'
  const mine = s => (shareId ? s.id === shareId : !!me && s.userId === me.userId)
  const payment = {
    id: settle.intentId || intent.intentId,
    userId: me?.userId ?? null,
    name: me?.name || '',
    shareId,
    method: 'card',
    provider: 'demo',
    amount: intent.amount,
    tipAmount: intent.tipAmount,
    status: 'succeeded',
    isDemo: true,
    last4: null,
    createdAt: null,
  }
  return {
    ...bill,
    status: settled ? 'paid' : (settle.billStatus || bill.status),
    shares: bill.shares.map(s => (mine(s) ? { ...s, status: 'paid' } : s)),
    myShare: bill.myShare
      ? { ...bill.myShare, status: 'paid' }
      : (shareId ? { id: shareId, amount: intent.shareAmount, status: 'paid', mode: intent.splitMode || bill.splitMode } : null),
    people: bill.people.map(p => (p.isMe ? { ...p, paid: true, shareStatus: 'paid' } : p)),
    myPayments: [...bill.myPayments.filter(p => p.id !== payment.id && p.status !== 'requires_action'), payment],
    tip: addMoney(bill.tip, intent.tipAmount),
    loyaltyEarned: settle.loyaltyEarned || bill.loyaltyEarned,
    receipt: settle.receipt || bill.receipt,
    paidAt: settled ? (bill.paidAt || new Date().toISOString()) : bill.paidAt,
  }
}
