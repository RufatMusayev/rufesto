import { formatPrice } from '../../lib/helpers'

const TONES = {
  accent: 'var(--accent)',
  gold: 'var(--gold)',
  muted: 'var(--t3)',
  red: 'var(--red)',
}

// An AZN amount in DM Mono with tabular figures.
export default function MoneyText({ value, tone, size = '0.9rem', strong = false }) {
  return (
    <span
      className="font-mono"
      style={{
        fontFamily: "'DM Mono', 'Courier New', monospace",
        fontVariantNumeric: 'tabular-nums',
        fontSize: size,
        fontWeight: strong ? 700 : 500,
        color: TONES[tone] || 'var(--t1)',
      }}
    >
      {formatPrice(value)}
    </span>
  )
}
