import { formatPrice } from '@shared/helpers'

// Amounts always come from the server; this only formats them.
export default function Money({ value, tone, strong = false }) {
  const cls = ['v2-money', tone ? `v2-money--${tone}` : '', strong ? 'v2-money--strong' : ''].filter(Boolean).join(' ')
  return <span className={cls}>{formatPrice(value ?? 0)}</span>
}
