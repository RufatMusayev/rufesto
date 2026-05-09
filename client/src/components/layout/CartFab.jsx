import { useCart } from '../../contexts/CartContext'

export default function CartFab() {
  const { itemCount, setOpen, tableId } = useCart()

  if (!tableId) return null

  return (
    <button
      onClick={() => setOpen(true)}
      aria-label="Open cart"
      className="cart-fab"
      style={{
        position: 'fixed',
        right: '1rem',
        width: 52, height: 52,
        borderRadius: '50%',
        background: itemCount > 0 ? 'var(--s2)' : 'var(--s3)',
        border: `1px solid ${itemCount > 0 ? 'var(--border)' : 'var(--border)'}`,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 80,
        transform: itemCount > 0 ? 'scale(1)' : 'scale(0.85)',
        opacity: itemCount > 0 ? 1 : 0.5,
        transition: 'all 0.2s',
        boxShadow: itemCount > 0 ? '0 8px 25px rgba(0,0,0,0.4)' : 'none',
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} style={{ width: 22, height: 22, stroke: 'var(--t1)' }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z" />
      </svg>
      {itemCount > 0 && (
        <span style={{
          position: 'absolute', top: -3, right: -3,
          minWidth: 20, height: 20, borderRadius: '50%',
          background: 'var(--accent)', color: '#0c0a09',
          fontSize: '0.6rem', fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid var(--bg)', padding: '0 3px',
        }}>
          {itemCount > 9 ? '9+' : itemCount}
        </span>
      )}
    </button>
  )
}
