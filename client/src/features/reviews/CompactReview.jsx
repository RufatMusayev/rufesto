import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Img } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { categoryEmoji } from '../../lib/helpers'
import { timeShort } from '../../lib/timeShort'
import { tap } from '../../lib/haptics'
import { seedDish } from '../../components/dish/dishLink'
import { patchFeedItem } from '../feed/feeds'
import { useDishAvailable } from '../feed/dishAvailability'
import { useRequireAuth, useToast } from '../social/hooks'
import { setReviewLike } from '../social/api'
import { guestName } from './names'
import { LikeGlyph, ReplyGlyph, VerifiedGlyph } from './Icons'
import './i18n'
import './reviews.css'

// the replies sheet and the photo viewer are only fetched when someone opens them
const RepliesSheet = lazy(() => import('./RepliesSheet'))
const MediaViewer = lazy(() => import('./MediaViewer'))

const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n)

/**
 * The compact "tweet" review row (docs/UX-PLAN-2026-10-18.md 4.2): 32 px avatar, name + verified check + short time + stars,
 * dish · venue, a body clamped to 2 lines ("…more"), an optional 56 px photo, a like and a reply button.
 *
 *   item     the review view model (features/reviews/mapper.js `mapReview`, or a feed item of kind 'review')
 *   variant  'row'  lists (Search, dish sheet, restaurant reviews, profile): no chrome, a hairline inset 58 px
 *            'card' feeds (Friends, Home): the same content on --s2, radius 14
 *            'own'  a profile's reviews: a 32 px dish picture instead of the avatar, the dish as the name, the venue below
 *   where    row 2 'full' (dish · venue) | 'dish' (restaurant reviews: only the dish) | 'none' (dish sheet: it is that dish)
 *   kicker   Home: "Popular review · 12 likes" above the row
 *   showActions  false hides like and reply (profile lists carry no counts)
 *   onOpen   card tap outside a control (Home popular reviews open the dish sheet)
 * Likes are optimistic and written to the feed lists (patchFeedItem), so every list shows the same number.
 */
function CompactReview({ item, variant = 'row', where = 'full', kicker = false, showActions = true, onOpen }) {
  const { t, i18n } = useTranslation('reviews')
  const { session } = useAuth()
  const { requireAuth, authModal } = useRequireAuth()
  const { toast, showToast } = useToast()
  const [liked, setLiked] = useState(item.likedByMe)
  const [likeCount, setLikeCount] = useState(item.likeCount)
  const [replyCount, setReplyCount] = useState(item.commentCount)
  const [pop, setPop] = useState(false)
  const [repliesOpen, setRepliesOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const busy = useRef(false)
  const popTimer = useRef(0)
  const own = variant === 'own'
  // a card that opens the dish (Home's popular reviews) follows the dish's live availability (feed/dishAvailability polls every
  // [data-dish-id] card on screen) and says so when it ran out
  const orderable = !!onOpen && !!item.dish?.id
  const liveAvailable = useDishAvailable(orderable ? item.dish.id : null, item.dish?.available ?? null)
  const soldOut = orderable && liveAvailable === false

  useEffect(() => {
    setLiked(item.likedByMe)
    setLikeCount(item.likeCount)
    setReplyCount(item.commentCount)
  }, [item.id, item.likedByMe, item.likeCount, item.commentCount])
  useEffect(() => () => clearTimeout(popTimer.current), [])

  const rating = Math.max(0, Math.min(5, Math.round(item.rating || 0)))
  const place = item.restaurant
  const dish = item.dish
  const personName = guestName(item.user.name, t('guest'))
  const dishHref = place?.slug ? `/restaurant/${place.slug}${dish?.id ? `?dish=${dish.id}` : ''}` : null

  async function like() {
    if (!requireAuth() || busy.current) return
    busy.current = true
    const next = !liked
    const nextCount = Math.max(0, likeCount + (next ? 1 : -1))
    setLiked(next)
    setLikeCount(nextCount)
    if (next) {
      setPop(true)
      tap(8)
      clearTimeout(popTimer.current)
      popTimer.current = setTimeout(() => setPop(false), 320)
    }
    const { error } = await setReviewLike(item.id, session.user.id, next)
    busy.current = false
    if (error) {
      setLiked(!next)
      setLikeCount(c => Math.max(0, c + (next ? -1 : 1)))
      showToast(error.key)
      return
    }
    patchFeedItem('review', item.id, { likedByMe: next, likeCount: nextCount })
  }

  // the replies sheet reports the real number after a load, an add or a delete
  const onCount = useCallback(n => {
    setReplyCount(n)
    patchFeedItem('review', item.id, { commentCount: n })
  }, [item.id])

  // row 2: "dish · venue" (the dish is cut first, the venue keeps up to 60 %), or the venue alone on the own variant
  const whereDish = own ? null : (where !== 'none' ? dish?.name : null)
  const wherePlace = own ? place?.name : (where === 'full' ? place?.name : null)
  const whereNode = (whereDish || wherePlace) ? (
    <>
      {whereDish && <span className="rv-where-dish">{whereDish}</span>}
      {whereDish && wherePlace && <span className="rv-where-sep" aria-hidden="true"> · </span>}
      {wherePlace && <span className="rv-where-place">{wherePlace}</span>}
      {soldOut && <span className="rv-where-sold">{t('soldOut')}</span>}
    </>
  ) : null

  const reason = item.reason === 'top_reviewer'
    ? t('popularTop')
    : (item.likes14d > 0 ? t('popularLikes', { count: item.likes14d }) : '')

  function onCardClick(e) {
    if (!onOpen || e.target.closest('a, button')) return
    onOpen(item)
  }

  const time = timeShort(item.createdAt, i18n.language)
  const verified = item.verified ? <VerifiedGlyph label={t('verified')} /> : null

  return (
    <article
      className={`rv rv--${variant}${kicker ? ' has-kicker' : ''}${onOpen ? ' is-open-able' : ''}`} onClick={onCardClick}
      data-dish-id={orderable ? item.dish.id : undefined}
    >
      {kicker && (
        <p className="rv-kicker">{t('popular')}{reason ? ` ${reason}` : ''}</p>
      )}

      {own ? (
        <span className="rv-av rv-av--dish" aria-hidden="true">
          {dish?.photo ? <Img src={dish.photo} ratio="1/1" fallback={categoryEmoji(dish?.category)} /> : categoryEmoji(dish?.category)}
        </span>
      ) : item.user.id ? (
        <Link to={`/u/${item.user.id}`} className="rv-av" aria-label={personName}>
          <Avatar name={personName} src={item.user.photo} size={32} />
        </Link>
      ) : (
        <span className="rv-av"><Avatar name={personName} src={item.user.photo} size={32} /></span>
      )}

      <div className="rv-main">
        <div className="rv-l1">
          {own ? (
            dishHref
              ? <Link to={dishHref} className="rv-name rv-name--link">{dish?.name || place?.name}</Link>
              : <span className="rv-name">{dish?.name || place?.name}</span>
          ) : (
            // not a link: the avatar next to it is the 44 px target to the profile (a second, 20 px high link would not be one)
            <span className="rv-name">{personName}</span>
          )}
          {verified}
          {time && <time className="rv-time" dateTime={item.createdAt}>{`· ${time}`}</time>}
          {rating > 0 && (
            <span className="rv-stars" role="img" aria-label={t('rating', { rating })}>{stars(rating)}</span>
          )}
        </div>

        <div className="rv-rest">
          <div className="rv-text">
            {whereNode && (dishHref
              ? <Link to={dishHref} className="rv-where" onClick={() => seedDish(dish, place)}>{whereNode}</Link>
              : <span className="rv-where">{whereNode}</span>)}
            {item.text && <Body text={item.text} />}
            {showActions && (
              <div className="rv-actions">
                <button
                  type="button" className={`rv-act rv-like${liked ? ' is-on' : ''}${pop ? ' is-pop' : ''}`}
                  aria-pressed={liked} aria-label={liked ? t('unlike') : t('like')} onClick={like}
                >
                  <LikeGlyph />
                  {likeCount > 0 && <span className="rv-count">{likeCount}</span>}
                </button>
                <button
                  type="button" className="rv-act"
                  aria-label={replyCount > 0 ? t('replies', { count: replyCount }) : t('reply')}
                  onClick={() => setRepliesOpen(true)}
                >
                  <ReplyGlyph />
                  {replyCount > 0 && <span className="rv-count">{replyCount}</span>}
                </button>
              </div>
            )}
          </div>
          {item.photoUrl && (
            <button type="button" className="rv-photo" aria-label={t('viewPhoto')} onClick={() => setPhotoOpen(true)}>
              <Img src={item.photoUrl} ratio="1/1" />
            </button>
          )}
        </div>
      </div>

      {repliesOpen && (
        <Suspense fallback={null}>
          <RepliesSheet item={item} onClose={() => setRepliesOpen(false)} onCount={onCount} />
        </Suspense>
      )}
      {photoOpen && (
        <Suspense fallback={null}>
          <MediaViewer src={item.photoUrl} alt={t('photoAlt')} onClose={() => setPhotoOpen(false)} />
        </Suspense>
      )}
      {toast}
      {authModal}
    </article>
  )
}

/**
 * The review text, clamped to 2 lines. "…more" shows only when the text really overflows (measured once, and again when
 * the fonts arrive) and opens it in place: the height is animated from the clamped to the full height (200 ms).
 */
function Body({ text }) {
  const { t } = useTranslation('reviews')
  const ref = useRef(null)
  const from = useRef(0)
  const [clamped, setClamped] = useState(false)
  const [open, setOpen] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    let alive = true
    const measure = () => { if (alive && !open) setClamped(el.scrollHeight > el.clientHeight + 1) }
    measure()
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure)
    return () => { alive = false }
  }, [text, open])

  // after the clamp is gone: grow from the clamped height to the full one, then let the height go back to auto
  useLayoutEffect(() => {
    const el = ref.current
    if (!open || !el) return undefined
    const to = el.scrollHeight
    el.style.height = `${from.current}px`
    void el.offsetHeight
    el.style.height = `${to}px`
    const done = () => { el.style.height = '' }
    el.addEventListener('transitionend', done, { once: true })
    const timer = setTimeout(done, 320)
    return () => { clearTimeout(timer); el.removeEventListener('transitionend', done) }
  }, [open])

  function expand() {
    from.current = ref.current ? ref.current.clientHeight : 0
    setOpen(true)
  }

  return (
    <div className="rv-bodywrap">
      <p ref={ref} className={`rv-body${open ? ' is-open' : ''}`}>{text}</p>
      {clamped && !open && (
        <button type="button" className="rv-more" onClick={expand}>…{t('more')}</button>
      )}
    </div>
  )
}

export default memo(CompactReview)
