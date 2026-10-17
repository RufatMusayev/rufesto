import { useTranslation } from 'react-i18next'
import { useCart } from '../../contexts/CartContext'

/** Floating cart button: only while seated, and visible once there is something in the cart (styles in layout.css). */
export default function CartFab() {
  const { itemCount, setOpen, tableId } = useCart()
  const { t } = useTranslation('cart')

  if (!tableId) return null

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={t('openCart')}
      className={`cart-fab${itemCount > 0 ? ' has-items' : ''}`}
      tabIndex={itemCount > 0 ? 0 : -1}
      aria-hidden={itemCount > 0 ? undefined : true}
    >
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z" />
      </svg>
      {itemCount > 0 && <span className="cart-fab-count">{itemCount > 9 ? '9+' : itemCount}</span>}
    </button>
  )
}
