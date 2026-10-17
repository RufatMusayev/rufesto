import { useTranslation } from 'react-i18next'
import './CartAddedToast.css'

/**
 * Bumps the floating cart button once (a CSS animation toggled by class, so the button itself, which belongs to the
 * app shell, needs no change). A no-op when there is no cart button on screen.
 */
export function bumpCartFab() {
  if (typeof document === 'undefined') return
  const el = document.querySelector('.cart-fab')
  if (!el) return
  el.classList.remove('is-bumped')
  void el.offsetWidth                       // restart the animation when it is still running
  el.classList.add('is-bumped')
  el.addEventListener('animationend', () => el.classList.remove('is-bumped'), { once: true })
}

/**
 * "Added <dish> · N in your order" with a View button, shown by CartContext after "+" / "Add to order" instead of
 * opening the whole "Your Order" sheet. `added` = { key, name, count, qty }; remounts (key) on every add so the
 * entrance replays. CartContext decides when it is visible and when it goes away.
 */
export default function CartAddedToast({ added, onView }) {
  const { t } = useTranslation('cart')
  return (
    <div className="cart-toast" role="status" key={added.key}>
      <span className="cart-toast-text">
        <span className="cart-toast-main">{t('addedToast', { name: added.name })}</span>
        <span className="cart-toast-sub">{t('addedCount', { count: added.count })}</span>
      </span>
      <button type="button" className="cart-toast-view" onClick={onView}>{t('viewOrder')}</button>
    </div>
  )
}
