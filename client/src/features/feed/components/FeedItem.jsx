import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import PostCard from '../../social/components/PostCard'
import PromoCard from '../../../components/PromoCard'
import { logFeedEvent } from '../events'

/** home_feed promo -> the campaign shape PromoCard reads (same card and click tracking as before). */
const toCampaign = p => ({
  id: p.id,
  title: p.title,
  description: p.description,
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
 * One slot of the ranked feed: a post card or a promo card, watched for impressions (>= 50 % visible
 * for 1 s) and for taps on the card. Like / comment / order_tap are logged by the cards themselves.
 */
export default function FeedItem({ item, index, events, onDeleted }) {
  const ref = useRef(null)
  const lastOpen = useRef(0)
  const navigate = useNavigate()
  const isPromo = item.kind === 'promo'
  const type = isPromo ? 'promo' : 'post'

  useEffect(() => events.observe(ref.current, {
    type, id: item.id, pool: item.pool, position: item.position,
    // the sponsored impression is counted when the card was really seen, once per load
    onImpression: isPromo ? () => trackCampaign(item.id, 'impression') : undefined,
  }), [events, type, isPromo, item.id, item.pool, item.position])

  function onClick(e) {
    // "open" = any tap on the card that is not a control: photo, caption, dish strip, header and
    // "view all comments" links all count. Controls log their own events (like, comment, "Order this")
    // or none (share, more). Taps inside sheets / modals rendered by the card are not taps on the card.
    const el = e.target
    if (!e.currentTarget.contains(el)) return                          // portal child (sheet)
    if (el.closest('.overlay, .soc-toast')) return                     // modal / toast drawn inside the card
    if (!isPromo && el.closest('button, input, textarea, select, .soc-act, .soc-order')) return
    const now = Date.now()
    if (now - lastOpen.current < OPEN_GAP_MS) return                   // a double tap on the photo is one open
    lastOpen.current = now
    logFeedEvent({ type, id: item.id, event: 'open', pool: item.pool, position: item.position })
  }

  return (
    <div ref={ref} className="soc-feed-slot" onClick={onClick}>
      {isPromo ? (
        <PromoCard
          campaign={toCampaign(item)}
          index={index}
          onDishClick={dish => {
            if (item.restaurant?.slug) navigate(`/restaurant/${item.restaurant.slug}?dish=${dish.id}&src=promo:${item.id}`)
          }}
        />
      ) : (
        <PostCard item={item} index={index} onDeleted={onDeleted} />
      )}
    </div>
  )
}
