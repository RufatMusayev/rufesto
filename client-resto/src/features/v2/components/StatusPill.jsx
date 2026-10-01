// Small status chip. Tones: gray | amber | green | blue | red | gold.
export default function StatusPill({ tone = 'gray', children, className = '' }) {
  return <span className={`v2-pill v2-pill--${tone} ${className}`.trim()}>{children}</span>
}

/** Tone for a bill status (open gray, requested amber, paying blue, paid green, void red). */
export const BILL_TONE = { open: 'gray', requested: 'amber', paying: 'blue', paid: 'green', void: 'red' }
