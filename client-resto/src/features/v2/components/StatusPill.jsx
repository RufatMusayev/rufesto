// Small status chip. Tones: gray | amber | green | blue | red | gold.
export default function StatusPill({ tone = 'gray', children, className = '' }) {
  return <span className={`v2-pill v2-pill--${tone} ${className}`.trim()}>{children}</span>
}

/** Tone for a bill status (open gray, requested amber, paying blue, paid green, void red). */
export const BILL_TONE = { open: 'gray', requested: 'amber', paying: 'blue', paid: 'green', void: 'red' }

/** Tone for a tip status (pending amber, earned green, void red). */
export const TIP_TONE = { pending: 'amber', earned: 'green', void: 'red' }

/** Tone for a staff role. */
export const ROLE_TONE = { admin: 'gold', manager: 'gold', waiter: 'blue', host: 'blue', cashier: 'green', kitchen: 'amber' }
