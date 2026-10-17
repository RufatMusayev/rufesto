import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { dishBackground } from '../lib/helpers'
import { dishEmoji } from '../lib/dishEmoji'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { useRequireAuth } from '../features/social/hooks'
import { LikeIcon } from '../features/social/components/Icons'
import DishReviewsSection from '../features/reviews/DishReviewsSection'
import BottomSheet from './ui/BottomSheet'
import Img from './ui/Img'
import DishFacts from './dish/DishFacts'
import DishActions from './dish/DishActions'
import DishIngredients from './dish/DishIngredients'
import DishFooter from './dish/DishFooter'
import WriteReviewSheet from './dish/WriteReviewSheet'
import { useDishEngagement } from './dish/useDishEngagement'
import './DishDetailSheet.css'

// the scanner (html5-qrcode) is only fetched when a guest taps "Scan QR to order"
const QRSheet = lazy(() => import('./QRSheet'))

const TOAST_MS = 2600
const DOUBLE_TAP_MS = 280
const DOUBLE_TAP_PX = 24
const BURST_MS = 650

/**
 * The dish sheet (UX plan section 7). First screen: photo (16:10), name and price, one meta line, the description,
 * the actions, then the reviews; one sticky footer with the next step. The sheet is URL-driven (?dish=<id>, see
 * dish/dishLink.js): `open` follows the URL, `onClose` asks the owner to pop it. Reviews come from the dish_reviews RPC
 * through features/reviews (real author names; the old direct read hid every other author behind RLS).
 */
export default function DishDetailSheet({ dish, open, onClose, onClosed }) {
  const { t } = useTranslation(['menu', 'restaurant'])
  const { addDish, tableId, restaurantId: seatedRestaurantId, restaurantName: seatedName, clearCartError } = useCart()
  const { session } = useAuth()
  const userId = session?.user?.id || null
  const { requireAuth, authModal } = useRequireAuth()
  const eng = useDishEngagement(dish.id, userId, requireAuth)

  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const [ingredients, setIngredients] = useState([])
  const [allergens, setAllergens] = useState([])
  const [summary, setSummary] = useState(null)
  const [writeOpen, setWriteOpen] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [showScan, setShowScan] = useState(false)
  const [burstOn, setBurstOn] = useState(false)
  const tap = useRef({ t: 0, x: 0, y: 0 })

  const showToast = useCallback(text => {
    clearTimeout(toastTimer.current)
    setToast(text)
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  useEffect(() => {
    let alive = true
    setSummary(null)
    supabase.from('dish_ingredients').select('quantity, unit, ingredients(name)').eq('dish_id', dish.id)
      .then(({ data }) => { if (alive) setIngredients(data || []) })
    supabase.from('dish_allergens').select('allergen').eq('dish_id', dish.id)
      .then(({ data }) => { if (alive) setAllergens(data || []) })
    return () => { alive = false }
  }, [dish.id])

  // one review per guest and dish: "Write" is offered until they have posted theirs
  useEffect(() => {
    setReviewed(false)
    if (!userId) return undefined
    let alive = true
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('dish_id', dish.id).eq('user_id', userId)
      .then(({ count }) => { if (alive) setReviewed((count || 0) > 0) })
    return () => { alive = false }
  }, [dish.id, userId])

  // the like burst plays for 650 ms each time the double-tap likes (or confirms a like)
  useEffect(() => {
    if (!eng.burst) return undefined
    setBurstOn(true)
    const id = setTimeout(() => setBurstOn(false), BURST_MS)
    return () => clearTimeout(id)
  }, [eng.burst])

  // double-tap on the photo: two taps within 280 ms and 24 px like (never unlike); a single tap does nothing
  function onPhotoClick(e) {
    const last = tap.current
    if (e.timeStamp - last.t < DOUBLE_TAP_MS && Math.abs(e.clientX - last.x) < DOUBLE_TAP_PX && Math.abs(e.clientY - last.y) < DOUBLE_TAP_PX) {
      tap.current = { t: 0, x: 0, y: 0 }
      eng.likeOnce()
    } else {
      tap.current = { t: e.timeStamp, x: e.clientX, y: e.clientY }
    }
  }

  async function save() {
    const res = await eng.toggleSave()
    if (res) showToast(t(res === 'saved' ? 'restaurant:dish.savedToast' : 'restaurant:dish.unsavedToast'))
  }

  async function share() {
    const slug = dish.restaurants?.slug
    const url = slug ? `${window.location.origin}/restaurant/${slug}?tab=menu&dish=${dish.id}` : window.location.href
    if (navigator.share) {
      try { await navigator.share({ title: dish.name, url }) } catch { /* the guest closed the share sheet */ }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      showToast(t('menu:dish.linkCopied'))
    } catch { showToast(url) }
  }

  const seatedElsewhere = !!tableId && !!dish.restaurant_id && !!seatedRestaurantId && dish.restaurant_id !== seatedRestaurantId
  const seatedHere = !!tableId && !seatedElsewhere

  function add() {
    clearCartError()
    addDish(dish)                // the cart toast and the cart button bump confirm it; the sheet closes (240 ms)
    onClose()
  }

  return (
    <>
      <BottomSheet
        open={open} onClose={onClose} onClosed={onClosed} id="dish" size="large" history={false} padded={false}
        labelledBy="dds-title" className="dds-root" bodyClassName="dds-body"
        footer={(
          <DishFooter
            dish={dish} seatedHere={seatedHere} seatedElsewhere={seatedElsewhere} seatedName={seatedName}
            onAdd={add} onScan={() => { if (requireAuth()) setShowScan(true) }} toast={toast}
          />
        )}
      >
        <div className="dds-photo-wrap">
          <div className={`dds-photo${dish.available ? '' : ' is-sold'}`} onClick={onPhotoClick}>
            <Img
              src={dish.photo} alt={dish.name} ratio="16/10" priority className="dds-photo-box"
              fallback={<span className="dds-emoji" style={{ background: dishBackground(dish.category) }} aria-hidden="true">{dishEmoji(dish)}</span>}
            />
            {!dish.available && <span className="dds-soldtag">{t('menu:soldOut')}</span>}
            {burstOn && <span key={eng.burst} className="dds-burst" aria-hidden="true"><LikeIcon active size={96} /></span>}
          </div>
          <button type="button" className="dds-x" onClick={onClose} aria-label={t('common:close')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <DishFacts dish={dish} summary={summary} />
        <DishActions eng={eng} onSave={save} onShare={share} />

        <div className="dds-reviews">
          <DishReviewsSection
            dishId={dish.id} refreshKey={refresh} onSummary={setSummary}
            onWrite={reviewed ? undefined : () => { if (requireAuth()) setWriteOpen(true) }}
          />
        </div>
        <DishIngredients ingredients={ingredients} allergens={allergens} />
      </BottomSheet>

      {userId && (
        <WriteReviewSheet
          open={writeOpen} onClose={() => setWriteOpen(false)} dishId={dish.id} userId={userId}
          onPosted={() => { setReviewed(true); setRefresh(n => n + 1) }}
        />
      )}
      {authModal}
      {showScan ? <Suspense fallback={null}><QRSheet onClose={() => setShowScan(false)} /></Suspense> : null}
    </>
  )
}
