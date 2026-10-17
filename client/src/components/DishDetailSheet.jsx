import { lazy, Suspense, useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { dishBackground, formatPrice, timeAgo, cleanDisplayName } from '../lib/helpers'
import { dishEmoji } from '../lib/dishEmoji'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { useRequireAuth } from '../features/social/hooks'
import useEscapeClose from './ui/useEscapeClose'
import VerifiedPill from './ui/VerifiedPill'
import DishReviewThread from './DishReviewThread'
import './DishDetailSheet.css'

// the scanner (html5-qrcode) is only fetched when a guest taps "Scan table QR to order"
const QRSheet = lazy(() => import('./QRSheet'))

const TOAST_MS = 2600
const REVIEW_COLS = '*, users(name, profile_photo)'

export default function DishDetailSheet({ dish, onClose }) {
  const { t, i18n } = useTranslation(['menu', 'common', 'restaurant', 'bookings'])
  const { addDish, tableId, restaurantId: seatedRestaurantId, restaurantName: seatedName, cartError, clearCartError } = useCart()
  const [showScan, setShowScan] = useState(false)
  const { session } = useAuth()
  // Like, save and review need a signed-in guest: a signed-out tap opens the sign-in sheet (as on Home) and never
  // flips a local state that nothing would store. The guest taps again once signed in.
  const { requireAuth, authModal } = useRequireAuth()
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  useEffect(() => () => clearTimeout(toastTimer.current), [])
  function showToast(text) {
    clearTimeout(toastTimer.current)
    setToast(text)
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS)
  }
  useEscapeClose(onClose)
  const [reviews, setReviews] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [allergens, setAllergens] = useState([])
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [saved, setSaved] = useState(false)
  const [likePop, setLikePop] = useState(false)
  const [savePop, setSavePop] = useState(false)
  const [showHeart, setShowHeart] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [showIngredients, setShowIngredients] = useState(false)
  const [myRating, setMyRating] = useState(0)
  const [myBody, setMyBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [myPhoto, setMyPhoto] = useState(null)
  const [myPhotoPreview, setMyPhotoPreview] = useState(null)
  const photoInputRef = useRef(null)
  const tapTimer = useRef(null)
  const tapCount = useRef(0)

  useEffect(() => {
    // Reviews come with their reply count (an embedded count of review_comments, flagged ones are hidden by RLS).
    // If the embed is refused for any reason the reviews are read again without it, never lost.
    const readReviews = cols => supabase
      .from('reviews')
      .select(cols)
      .eq('dish_id', dish.id)
      .eq('is_flagged', false)
      .order('created_at', { ascending: false })
      .limit(20)
    readReviews(`${REVIEW_COLS}, review_comments(count)`).then(({ data, error }) => {
      if (!error) { setReviews(data || []); return }
      readReviews(REVIEW_COLS).then(({ data: plain }) => setReviews(plain || []))
    })

    supabase
      .from('dish_ingredients')
      .select('quantity, unit, ingredients(name)')
      .eq('dish_id', dish.id)
      .then(({ data }) => setIngredients(data || []))

    supabase
      .from('dish_allergens')
      .select('allergen')
      .eq('dish_id', dish.id)
      .then(({ data }) => setAllergens(data || []))

    supabase
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('target_type', 'dish')
      .eq('target_id', dish.id)
      .then(({ count }) => setLikeCount(count || 0))

    if (session) {
      supabase
        .from('saved_dishes')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('dish_id', dish.id)
        .maybeSingle()
        .then(({ data }) => setSaved(!!data))

      supabase
        .from('likes')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('target_type', 'dish')
        .eq('target_id', dish.id)
        .maybeSingle()
        .then(({ data }) => setLiked(!!data))
    }
  }, [dish.id, session?.user?.id])

  // Returns false (and opens the sign-in sheet) when nobody is signed in; nothing changes then.
  function toggleLike() {
    if (!requireAuth()) return false
    persistLike()
    return true
  }

  async function persistLike() {
    const next = !liked
    setLiked(next)
    setLikeCount(c => c + (next ? 1 : -1))
    if (next) setLikePop(true)
    try {
      if (next) {
        const { error } = await supabase.from('likes').insert({
          user_id: session.user.id, target_type: 'dish', target_id: dish.id,
        })
        if (error) { setLiked(false); setLikeCount(c => c - 1) }
      } else {
        const { error } = await supabase.from('likes').delete()
          .eq('user_id', session.user.id)
          .eq('target_type', 'dish')
          .eq('target_id', dish.id)
        if (error) { setLiked(true); setLikeCount(c => c + 1) }
      }
    } catch {
      setLiked(!next)
      setLikeCount(c => c + (next ? -1 : 1))
    }
  }

  const hasReviewed = session && reviews.some(r => r.user_id === session.user.id)
  // seated, but at another restaurant than this dish's: adding would be refused, so the sheet says where they sit
  const seatedElsewhere = !!tableId && !!dish.restaurant_id && !!seatedRestaurantId && dish.restaurant_id !== seatedRestaurantId

  function handleDoubleTap() {
    tapCount.current++
    if (tapCount.current === 1) {
      tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 300)
    } else if (tapCount.current === 2) {
      clearTimeout(tapTimer.current)
      tapCount.current = 0
      // the burst only plays for a like that really happens (signed-out: the sign-in sheet opens instead)
      if (liked || toggleLike()) {
        setShowHeart(true)
        setTimeout(() => setShowHeart(false), 900)
      }
    }
  }

  async function handleSubmitReview(e) {
    e.preventDefault()
    if (!myRating) { setReviewError(t('menu:selectRating')); return }
    setReviewError('')
    setSubmitting(true)
    let photoUrl = null
    if (myPhoto) {
      const ext = (myPhoto.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `reviews/${session.user.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('dish-photos').upload(path, myPhoto)
      if (upErr) { setSubmitting(false); setReviewError(t('menu:photoUploadFailed', { message: upErr.message })); return }
      photoUrl = supabase.storage.from('dish-photos').getPublicUrl(path).data.publicUrl
    }
    const { data, error } = await supabase.from('reviews').insert({
      dish_id: dish.id,
      user_id: session.user.id,
      rating: myRating,
      body: myBody || null,
      photo: photoUrl,
    }).select('*, users(name, profile_photo)').single()
    setSubmitting(false)
    if (error) { setReviewError(error.message); return }
    setReviews(prev => [data, ...prev])
    setShowReviewForm(false)
    setMyRating(0)
    setMyBody('')
    if (myPhotoPreview) URL.revokeObjectURL(myPhotoPreview)
    setMyPhoto(null)
    setMyPhotoPreview(null)
  }

  async function handleToggleSave() {
    if (!requireAuth()) return
    const next = !saved
    setSaved(next)
    if (next) setSavePop(true)
    try {
      if (next) {
        const { error } = await supabase.from('saved_dishes').upsert(
          { user_id: session.user.id, dish_id: dish.id },
          { onConflict: 'user_id,dish_id' }
        )
        if (error) { console.error('Save failed:', error.message); setSaved(false) }
        else showToast(t('restaurant:dish.savedToast'))
      } else {
        const { error } = await supabase.from('saved_dishes').delete().eq('user_id', session.user.id).eq('dish_id', dish.id)
        if (error) { console.error('Unsave failed:', error.message); setSaved(true) }
        else showToast(t('restaurant:dish.unsavedToast'))
      }
    } catch (err) {
      console.error('Save error:', err)
      setSaved(!next)
    }
  }

  // Only dietary/lifestyle tags — kcal and prep are shown in the meta line above, not here
  const tags = [
    dish.is_vegan && 'vegan',
    dish.is_vegetarian && 'vegetarian',
    dish.is_gluten_free && 'glutenfree',
    dish.is_spicy && 'spicy',
  ].filter(Boolean)

  return (
    <div
      className="overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div className="sheet" style={{
        maxWidth: 470, width: '100%', margin: '0 auto',
        maxHeight: '93vh', overflowY: 'auto',
        background: 'var(--bg)',
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
      }}>
        <div className="sheet-handle" />

        {/* Sheet header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '8px 14px 10px', gap: 10,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: dishBackground(dish.category),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', flexShrink: 0,
            border: '1.5px solid var(--border)',
          }}>
            {dishEmoji(dish)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontWeight: 700, fontSize: '0.96rem', color: 'var(--t1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {dish.name}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--t4)', marginTop: 1 }}>
              {dish.menu_sections?.name || dish.restaurants?.name || dish.category}
            </div>
          </div>
          <button
            onClick={onClose}
            className="icon-btn"
            aria-label={t('common:close')}
            style={{ color: 'var(--t2)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Dish image: 4:5, but never taller than 40% of the screen (see .dds-photo) */}
        <div
          onClick={handleDoubleTap}
          className={`dds-photo${dish.available ? '' : ' is-sold'}`}
          style={{ background: dish.photo ? '#000' : dishBackground(dish.category) }}
        >
          {dish.photo ? (
            <img src={dish.photo} alt={dish.name} loading="lazy" className="dds-photo-img" />
          ) : (
            <span style={{
              filter: 'drop-shadow(0 10px 28px rgba(0,0,0,0.5))',
              transition: 'transform 0.4s ease',
            }}>
              {dishEmoji(dish)}
            </span>
          )}

          {/* Vignette */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.32) 100%)',
            pointerEvents: 'none',
          }} />

          {/* Availability badge */}
          {dish.available ? (
            <div style={{
              position: 'absolute', top: 14, right: 14,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 100, padding: '4px 11px',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span className="open-indicator" />
              <span style={{ fontSize: '0.63rem', fontWeight: 600, color: '#F5F0E8' }}>{t('menu:available')}</span>
            </div>
          ) : (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                background: 'rgba(0,0,0,0.78)', padding: '6px 22px',
                borderRadius: 100, fontSize: '0.8rem', fontWeight: 700, color: '#F5F0E8',
                letterSpacing: 1.2, textTransform: 'uppercase',
              }}>{t('menu:soldOut')}</span>
            </div>
          )}

          {/* Price badge */}
          <div style={{
            position: 'absolute', bottom: 16, left: 16,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderRadius: 10, padding: '7px 14px',
          }}>
            <div style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '1.1rem', fontWeight: 700, color: '#F5F0E8', letterSpacing: -0.3,
            }}>
              {formatPrice(dish.price)}
            </div>
          </div>

          {/* Rating badge */}
          {dish.review_count > 0 && (
            <div style={{
              position: 'absolute', bottom: 16, right: 16,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 10, padding: '7px 12px',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ color: 'var(--gold)', fontSize: '0.75rem' }}>★</span>
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '0.82rem', fontWeight: 700, color: '#F5F0E8',
              }}>
                {Number(dish.avg_rating || 0).toFixed(1)}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'rgba(245,240,232,0.55)' }}>
                ({dish.review_count})
              </span>
            </div>
          )}

          {/* Double-tap heart burst */}
          {showHeart && (
            <span style={{
              position: 'absolute', top: '50%', left: '50%',
              fontSize: '5rem',
              animation: 'perfettoBurst 0.9s ease forwards',
              filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))',
              pointerEvents: 'none',
              transform: 'translate(-50%, -50%)',
            }}>
              👌
            </span>
          )}
        </div>

        {/* Action bar: each action is an icon AND a word (title + aria-label say more); like / save / review ask a signed-out guest to sign in */}
        <div className="dds-actions">
          <button
            type="button"
            className={`dds-act${liked ? ' is-on' : ''}`}
            onClick={toggleLike}
            title={liked ? t('restaurant:dish.unlikeAria') : t('restaurant:dish.likeAria')}
            aria-label={liked ? t('restaurant:dish.unlikeAria') : t('restaurant:dish.likeAria')}
          >
            <svg viewBox="0 0 24 24"
              className={`dds-act-icon dds-act-icon--like${likePop ? ' like-btn-active' : ''}`}
              onAnimationEnd={() => setLikePop(false)}
              aria-hidden="true">
              <path d="M8 14c-1.5-1-2.5-2.8-2-4.5.5-1.8 2-2.5 3.5-2s2.5 2 2 3.8c-.3 1-1 1.7-1.8 2" />
              <path d="M9.7 13.3c.8-.3 1.8-.2 2.8.5" />
              <path d="M12.5 13.8c.5-2.5 1.2-5 2-6.5.6-1 1.8-1.2 2.5-.5s.5 2-.2 3.5" />
              <path d="M14 14.5c.8-2 1.5-4 2.2-5.2.5-.8 1.5-1 2.2-.3s.3 1.8-.3 3.2" />
              <path d="M15.2 15c.6-1.5 1.2-3 1.8-4 .4-.7 1.3-.8 1.8-.2s.2 1.5-.3 2.8" />
              <path d="M7.5 15c-.5.8-.8 2-.5 3 .5 1.5 2 2.5 4 2.8s4-.2 5.5-1.5c1-1 1.5-2.5 1.5-4" />
            </svg>
            <span className="dds-act-label">{liked ? t('restaurant:dish.liked') : t('restaurant:dish.like')}</span>
          </button>

          <button
            type="button"
            className="dds-act"
            onClick={() => { if (requireAuth()) setShowReviewForm(f => !f) }}
            title={t('restaurant:dish.reviewAria')}
            aria-label={t('restaurant:dish.reviewAria')}
          >
            <svg viewBox="0 0 24 24" className="dds-act-icon" aria-hidden="true">
              <path d="M7 2v8a3 3 0 006 0V2" />
              <path d="M10 2v20" />
              <path d="M17 2v6c0 1.1.9 2 2 2h0c0 1.1-.9 2-2 2v10" />
            </svg>
            <span className="dds-act-label">{t('restaurant:dish.review')}</span>
          </button>

          <div className="dds-actions-gap" />

          <button
            type="button"
            className={`dds-act${saved ? ' is-on' : ''}`}
            onClick={handleToggleSave}
            title={saved ? t('restaurant:dish.unsaveAria') : t('restaurant:dish.saveAria')}
            aria-label={saved ? t('restaurant:dish.unsaveAria') : t('restaurant:dish.saveAria')}
          >
            <svg viewBox="0 0 24 24"
              className={`dds-act-icon dds-act-icon--save${savePop ? ' like-btn-active' : ''}`}
              onAnimationEnd={() => setSavePop(false)}
              aria-hidden="true">
              <ellipse cx="12" cy="14" rx="8" ry="4" />
              <path d="M12 3v7" />
              <circle cx="12" cy="3" r="1.5" fill="currentColor" />
            </svg>
            <span className="dds-act-label">{saved ? t('restaurant:dish.saved') : t('restaurant:dish.save')}</span>
          </button>
        </div>

        {likeCount > 0 && (
          <div style={{
            padding: '0 14px 4px',
            fontSize: '0.8rem', fontWeight: 700, color: 'var(--t1)',
          }}>
            {t('menu:likeCount', { count: likeCount })}
          </div>
        )}

        {/* Caption: the name is in the header already, so only what the dish is */}
        <div style={{ padding: '0 14px 10px' }}>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.55, color: 'var(--t2)' }}>
            {dish.description || t('menu:categoryDish', { category: dish.category })}
          </p>

          {dish.restaurants?.slug && (
            <Link to={`/restaurant/${dish.restaurants.slug}`} className="dds-menu-link tap-text">
              {t('menu:viewRestaurantMenu')}
            </Link>
          )}

          {dish.calories && dish.prep_time_min && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginTop: 7,
              fontFamily: "'DM Mono', monospace",
              fontSize: '0.7rem', color: 'var(--t3)',
            }}>
              <span>{t('menu:kcal', { count: dish.calories })}</span>
              <span style={{ color: 'var(--border-strong)' }}>·</span>
              <span>{t('menu:prepMin', { count: dish.prep_time_min })}</span>
            </div>
          )}

          {tags.length > 0 && (
            <p style={{ fontSize: '0.78rem', color: 'var(--accent)', marginTop: 6, lineHeight: 1.8 }}>
              {tags.map(t => `#${t}`).join(' ')}
            </p>
          )}
        </div>

        {/* Allergens */}
        {allergens.length > 0 && (
          <div style={{ padding: '0 14px 10px' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('menu:allergens')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {allergens.map((a, i) => (
                <span key={i} style={{
                  fontSize: '0.68rem', fontWeight: 600,
                  padding: '3px 9px', borderRadius: 100,
                  background: 'rgba(245,158,11,0.1)',
                  color: '#D97706',
                  border: '1px solid rgba(245,158,11,0.25)',
                  textTransform: 'capitalize',
                }}>
                  {a.allergen}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Ingredients */}
        {ingredients.length > 0 && (
          <div style={{ padding: '0 14px 12px' }}>
            <button className="tap-text" onClick={() => setShowIngredients(!showIngredients)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: '0.76rem', fontWeight: 600, color: 'var(--t2)',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'color 150ms var(--ease-out)',
            }}>
              {t('menu:ingredientsCount', { count: ingredients.length })}
              <svg viewBox="0 0 16 16" fill="currentColor" style={{
                width: 12, height: 12, color: 'var(--t4)',
                transform: showIngredients ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.2s var(--ease-out)',
              }}>
                <path d="M8 11L3 6h10l-5 5z" />
              </svg>
            </button>
            {showIngredients && (
              <div style={{
                marginTop: 8, padding: '10px 12px',
                background: 'var(--s2)', borderRadius: 10,
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 0' }}>
                  {ingredients.map((ing, i) => (
                    <span key={i} style={{
                      fontSize: '0.74rem', color: 'var(--t2)',
                      display: 'flex', alignItems: 'center', gap: 4,
                      marginRight: 10,
                    }}>
                      <span style={{
                        width: 4, height: 4, borderRadius: '50%',
                        background: 'var(--gold)', flexShrink: 0,
                      }} />
                      {ing.ingredients?.name}
                      {ing.quantity && (
                        <span style={{
                          fontFamily: "'DM Mono', monospace",
                          color: 'var(--t4)', fontSize: '0.66rem',
                        }}>
                          {ing.quantity}{ing.unit || 'g'}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Separator */}
        <div style={{ height: 1, background: 'var(--border)', margin: '0 14px' }} />

        {/* Next step. Seated here: add to the order. Seated at another restaurant: say where. Not seated: two real
            buttons, scan the table QR (order from your phone) or reserve a table; never a dead end. */}
        {dish.available && tableId && !seatedElsewhere ? (
          <div style={{ padding: '12px 14px' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '11px 0', fontSize: '0.88rem', fontWeight: 700, borderRadius: 12 }}
              onClick={() => { clearCartError(); addDish(dish, { open: true }); onClose() }}
              onPointerDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
              onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {t('menu:addToOrder', { price: formatPrice(dish.price) })}
            </button>
          </div>
        ) : dish.available && seatedElsewhere ? (
          <div className="dds-next">
            <p className="dds-next-note" role="status">
              {seatedName
                ? <Trans t={t} i18nKey="restaurant:dish.seatedAt" values={{ venue: seatedName }} components={{ b: <strong /> }} />
                : t('restaurant:dish.seatedElsewhere')}
            </p>
          </div>
        ) : dish.available ? (
          <div className="dds-next">
            <p className="dds-next-hint">{t('restaurant:dish.orderHint')}</p>
            <button type="button" className="btn btn-primary dds-next-btn" onClick={() => { if (requireAuth()) setShowScan(true) }}>
              {t('restaurant:dish.scanToOrder')}
            </button>
            {dish.restaurants?.slug ? (
              <Link to={`/book/${dish.restaurants.slug}`} className="btn btn-ghost dds-next-btn">
                {t('bookings:reserve')}
              </Link>
            ) : null}
          </div>
        ) : null}

        {/* Reviews section */}
        {reviews.length > 0 && (
          <div style={{ padding: '4px 14px 2px' }}>
            <div style={{
              fontSize: '0.7rem', fontWeight: 700, color: 'var(--t3)',
              textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
            }}>
              {t('menu:reviewsCount', { count: reviews.length })}
            </div>
            <div>
              {reviews.slice(0, showReviewForm ? 20 : 3).map(r => (
                <div key={r.id} style={{
                  display: 'flex', gap: 9, marginBottom: 10, alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'var(--s3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.65rem', fontWeight: 700, color: 'var(--t2)', flexShrink: 0,
                    border: '1px solid var(--border)',
                  }}>
                    {(r.users?.name || 'A')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 7px', marginBottom: 2,
                    }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--t1)' }}>
                        {cleanDisplayName(r.users?.name)}
                      </span>
                      {r.is_verified && <VerifiedPill />}
                      <span style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: '0.66rem', color: 'var(--gold)', letterSpacing: 0.5,
                      }}>
                        {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                      </span>
                      <span style={{ fontSize: '0.64rem', color: 'var(--t4)', marginLeft: 'auto' }}>
                        {timeAgo(r.created_at, i18n.language)}
                      </span>
                    </div>
                    {r.body && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--t2)', lineHeight: 1.45, fontWeight: 400 }}>
                        {r.body}
                      </p>
                    )}
                    {r.photo && (
                      <img src={r.photo} alt="Review photo" loading="lazy" style={{
                        marginTop: 6, width: '100%', maxWidth: 220, borderRadius: 10,
                        border: '1px solid var(--border)', display: 'block',
                      }} />
                    )}
                    <DishReviewThread
                      reviewId={r.id}
                      initialCount={Number(r.review_comments?.[0]?.count) || 0}
                      requireAuth={requireAuth}
                    />
                  </div>
                </div>
              ))}
            </div>
            {!showReviewForm && reviews.length > 3 && (
              <button className="tap-text" onClick={() => setShowReviewForm(true)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.76rem', color: 'var(--t3)', padding: 0,
                fontWeight: 500,
              }}>
                {t('menu:viewAllReviews', { count: reviews.length })}
              </button>
            )}
          </div>
        )}

        {/* Write review */}
        {session && !hasReviewed && (
          <div style={{
            padding: '10px 14px 14px',
            borderTop: '1px solid var(--border)',
          }}>
            {!showReviewForm ? (
              <button className="tap-text" onClick={() => setShowReviewForm(true)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.8rem', color: 'var(--t3)', padding: 0, fontWeight: 500,
              }}>
                {t('menu:addReviewPlaceholder')}
              </button>
            ) : (
              <form onSubmit={handleSubmitReview}>
                {/* Star rating */}
                <div style={{
                  display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center',
                }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" className="tap" onClick={() => setMyRating(n)} style={{
                      background: 'none', border: 'none',
                      fontSize: '1.4rem', cursor: 'pointer', padding: 2,
                      color: n <= myRating ? 'var(--gold)' : 'var(--border-strong)',
                      transition: 'color 0.1s var(--ease-out), transform 0.1s var(--ease-out)',
                      transform: n <= myRating ? 'scale(1.12)' : 'scale(1)',
                      lineHeight: 1,
                    }}>
                      {n <= myRating ? '★' : '☆'}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input
                    className="input"
                    placeholder={t('menu:writeReviewPlaceholder')}
                    value={myBody}
                    maxLength={1000}
                    onChange={e => setMyBody(e.target.value)}
                    style={{ flex: 1, fontSize: '0.82rem', padding: '9px 13px', borderRadius: 20 }}
                  />
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      if (myPhotoPreview) URL.revokeObjectURL(myPhotoPreview)
                      setMyPhoto(f)
                      setMyPhotoPreview(URL.createObjectURL(f))
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    aria-label={t('menu:addPhoto')}
                    className="tap"
                    style={{
                      borderRadius: '50%', flexShrink: 0,
                      background: myPhoto ? 'var(--gold)' : 'var(--s2)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                      fontSize: '0.95rem', lineHeight: 1,
                    }}
                  >
                    📷
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ padding: '8px 18px', fontSize: '0.82rem', borderRadius: 20, flexShrink: 0 }}
                    disabled={submitting || !myRating}
                  >
                    {submitting ? '...' : t('menu:post')}
                  </button>
                </div>
                {myPhotoPreview && (
                  <div style={{ position: 'relative', display: 'inline-block', marginTop: 8 }}>
                    <img src={myPhotoPreview} alt="Preview" style={{
                      width: 72, height: 72, objectFit: 'cover', borderRadius: 10,
                      border: '1px solid var(--border)', display: 'block',
                    }} />
                    <button
                      type="button"
                      className="hit-ext"
                      aria-label={t('menu:removePhoto')}
                      onClick={() => {
                        URL.revokeObjectURL(myPhotoPreview)
                        setMyPhoto(null)
                        setMyPhotoPreview(null)
                      }}
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        width: 20, height: 20, borderRadius: '50%',
                        background: 'var(--t1)', color: 'var(--s1)',
                        border: 'none', cursor: 'pointer', fontSize: '0.7rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        lineHeight: 1, padding: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
                {reviewError && (
                  <p style={{ color: 'var(--red)', fontSize: '0.72rem', marginTop: 5 }}>
                    {reviewError}
                  </p>
                )}
              </form>
            )}
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
      {toast ? <div className="dds-toast" role="status">{toast}</div> : null}
      {authModal}
      {showScan ? <Suspense fallback={null}><QRSheet onClose={() => setShowScan(false)} /></Suspense> : null}
    </div>
  )
}
