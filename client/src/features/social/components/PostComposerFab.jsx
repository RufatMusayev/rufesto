import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCart } from '../../../contexts/CartContext'
import { useRequireAuth } from '../hooks'
import { PlusIcon } from './Icons'

/** True while the page is being scrolled down past the first screen; false again on any scroll up. */
function useScrolledAway() {
  const [away, setAway] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    let queued = false
    const update = () => {
      queued = false
      const y = window.scrollY
      if (Math.abs(y - last) < 8) return
      setAway(y > 160 && y > last)
      last = y
    }
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update) } }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return away
}

/**
 * Gold "+" that opens the new-post screen. HomeTabs shows it on the Home and Friends tabs. It slides out of
 * the way while the guest scrolls down to read (so it never sits on a card's "Order this") and comes back on
 * the first scroll up; it is hidden by CSS while a sheet or modal is open (index.css).
 */
export default function PostComposerFab() {
  const { t } = useTranslation('social')
  const navigate = useNavigate()
  const { tableId } = useCart()
  const { requireAuth, authModal } = useRequireAuth()
  const away = useScrolledAway()
  return (
    <>
      <button
        type="button"
        // sits above the cart FAB while a table session is active
        className={`soc-fab${tableId ? ' soc-fab-raised' : ''}${away ? ' soc-fab-away' : ''}`}
        aria-label={t('home.newPost')}
        tabIndex={away ? -1 : 0}
        onClick={() => { if (requireAuth()) navigate('/post/new') }}
      >
        <PlusIcon />
      </button>
      {authModal}
    </>
  )
}
