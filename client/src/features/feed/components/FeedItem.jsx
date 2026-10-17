import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import PostCard from '../../social/components/PostCard'
import CompactReview from '../../reviews/CompactReview'
import PromoCard from '../../../components/PromoCard'
import { logFeedEvent } from '../events'

/** home_feed promo -> the campaign shape PromoCard reads (same card and click tracking as before). */
const toCampaign = p => ({
  id: p.id,
  title: p.title,
  description: p.description,
  discount_percent: p.discountPercent,
  discount_amount: p.discountAmount,
  image_url: p.imageUrl,
  restaurants: p.restaurant ? { name: p.restaurant.name, slug: p.restaurant.slug } : null,
  dishes: p.dish ? { id: p.dish.id, name: p.dish.name, photo: p.dish.photo, price: p.dish.price } : null,
})

const OPEN_GAP_MS = 800

function trackCampaign(id, event) {
  // fire and forget, never blocks the UI (same call HomePage makes)
  try { supabase.rpc('track_campaign', { p_campaign_id: id, p_event: event }).then(() => {}, () => {}) } catch { /* ignore */ }
}

/**
 * One slot of a feed: a post card, a promo card or a review card (a friend's review on Friends, a "popular review" on
 * Home). Posts, promos and popular reviews are watched for impressions (>= 50 % visible for 1 s) and for taps on the
 * card; Like / comment / order_tap are logged by the cards themselves. A friend's review is not a feed-event item
 * (feed_events knows reviews only with pool 'popular', sql/67), so it is shown untracked. Tapping a popular review
 * opens its dish sheet, not the review. `className` replaces the slot wrapper's class. `priority` marks one of the
 * first photos of a feed (eager load, high fetch priority, no rise-in animation).
 */
export default function FeedItem({ item, index, events, onDeleted, priority = false, className = 'soc-feed-slot' }) {
  const ref = useRef(null)
  const lastOpen = useRef(0)
  const navigate = useNavigate()
  const isPromo = item.kind === 'promo'
  const isReview = item.kind === 'review'
  const popular = isReview && item.pool === 'popular'
  const tracked = !isReview || popular
  const type = isPromo ? 'promo' : isReview ? 'review' : 'post'

  useEffect(() => {
    if (!tracked) return undefined
    return events.observe(ref.current, {
      type, id: item.id, pool: item.pool, position: item.position,
      // the sponsored impression is counted when the card was really seen, once per load
      onImpression: isPromo ? () => trackCampaign(item.id, 'impression') : undefined,
    })
  }, [events, type, isPromo, tracked, item.id, item.pool, item.position])

  function onClick(e) {
    if (!tracked) return
    // "open" = any tap on the card that is not a control: photo, caption, dish strip, header and
    // "view all comments" links all count. Controls log their own events (like, comment, "Order this")
    // or none (share, more). Taps inside sheets / modals rendered by the card are not taps on the card.
    const el = e.target
    if (!e.currentTarget.contains(el)) return                          // portal child (sheet)
    if (el.closest('.overlay, .bs-root, .soc-toast')) return           // sheet / modal / toast drawn inside the card
    if (!isPromo && el.closest('button, input, textarea, select, .soc-act, .soc-order')) return
    const now = Date.now()
    if (now - lastOpen.current < OPEN_GAP_MS) return                   // a double tap on the photo is one open
    lastOpen.current = now
    logFeedEvent({ type, id: item.id, event: 'open', pool: item.pool, position: item.position })
  }

  return (
    <div ref={ref} className={className} onClick={onClick}>
      {isReview ? (
        <CompactReview
          item={item} variant="card" kicker={popular}
          onOpen={popular && item.restaurant?.slug && item.dish?.id
            ? r => navigate(`/restaurant/${r.restaurant.slug}?dish=${r.dish.id}`)
            : undefined}
        />
      ) : isPromo ? (
        <PromoCard
          campaign={toCampaign(item)}
          index={Math.max(0, index)}
          onDishClick={dish => {
            if (item.restaurant?.slug) navigate(`/restaurant/${item.restaurant.slug}?dish=${dish.id}&src=promo:${item.id}`)
          }}
        />
      ) : (
        <PostCard item={item} index={index} priority={priority} onDeleted={onDeleted} />
      )}
    </div>
  )
}
