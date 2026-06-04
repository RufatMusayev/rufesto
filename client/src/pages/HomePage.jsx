import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cuisineEmoji, cuisineBackground, isRestaurantOpen, getTodayHours, categoryEmoji, dishBackground, timeAgo } from '../lib/helpers'
import { useAuth } from '../contexts/AuthContext'
import DishDetailSheet from '../components/DishDetailSheet'

export default function HomePage() {
  const [restaurants, setRestaurants] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [dishDetail, setDishDetail] = useState(null)
  const [followedIds, setFollowedIds] = useState([])
  const { session } = useAuth()

  useEffect(() => {
    async function loadFeed() {
      let followIds = []
      if (session) {
        const { data: follows } = await supabase
          .from('user_follows')
          .select('restaurant_id')
          .eq('user_id', session.user.id)
        followIds = (follows || []).map(f => f.restaurant_id)
        setFollowedIds(followIds)
      }

      const [{ data: restData }, { data: revData }] = await Promise.all([
        supabase
          .from('restaurants')
          .select('*, operating_hours(*)')
          .eq('status', 'active')
          .order('name'),
        supabase
          .from('reviews')
          .select('*, dishes(name, category, restaurant_id, restaurants(name, slug, cuisine_type)), users(name, profile_photo)')
          .eq('is_flagged', false)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      const allRest = restData || []
      const followed = allRest.filter(r => followIds.includes(r.id))
      const rest = allRest.filter(r => !followIds.includes(r.id))
      setRestaurants([...followed, ...rest])

      const allRevs = revData || []
      const followedRevs = allRevs.filter(r => followIds.includes(r.dishes?.restaurant_id))
      const otherRevs = allRevs.filter(r => !followIds.includes(r.dishes?.restaurant_id))
      setReviews([...followedRevs, ...otherRevs])

      setLoading(false)
    }
    loadFeed()
  }, [session?.user?.id])

  return (
    <div>
      {loading ? (
        <>
          <StoriesBarSkeleton />
          {[1, 2].map(i => <PostSkeleton key={i} />)}
        </>
      ) : (
        <>
          <StoriesBar restaurants={restaurants} followedIds={followedIds} />
          <div style={{ maxWidth: 470, margin: '0 auto' }}>
            {buildFeed(reviews, restaurants).map((item, i) =>
              item._type === 'review'
                ? <ReviewPostCard key={`rev-${item.id}`} review={item} index={i} onDishClick={setDishDetail} />
                : <FeedPost key={`rest-${item.id}`} restaurant={item} index={i} followedIds={followedIds} />
            )}
            <div style={{ height: 80 }} />
          </div>
        </>
      )}

      {dishDetail && (
        <DishDetailSheet dish={dishDetail} onClose={() => setDishDetail(null)} />
      )}
    </div>
  )
}

function StoriesBar({ restaurants, followedIds = [] }) {
  return (
    <div className="no-scrollbar" style={{
      display: 'flex', gap: 12, padding: '16px',
      overflowX: 'auto',
      borderBottom: '1px solid var(--border)',
    }}>
      {restaurants.map((r, i) => {
        const open = isRestaurantOpen(r.operating_hours)
        const isFollowed = followedIds.includes(r.id)
        return (
          <Link key={r.id} to={`/restaurant/${r.slug}`} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            flexShrink: 0, textDecoration: 'none',
            animation: 'feedItemIn 400ms cubic-bezier(0.23,1,0.32,1) both',
            animationDelay: `${Math.min(i, 8) * 50}ms`,
          }}>
            {/* Square editorial card */}
            <div style={{
              width: 64, height: 72, borderRadius: 12,
              background: cuisineBackground(r.cuisine_type),
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 4,
              position: 'relative',
              border: isFollowed
                ? '2px solid var(--gold)'
                : `2px solid ${open ? 'rgba(77,124,63,0.45)' : 'var(--border)'}`,
              transition: 'border-color 200ms',
              overflow: 'hidden',
            }}>
              <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>
                {cuisineEmoji(r.cuisine_type)}
              </span>
              {/* Open status bar */}
              {open && (
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: 4, background: 'var(--sage)',
                }} />
              )}
            </div>
            <span style={{
              fontSize: '0.67rem', color: 'var(--t2)', fontWeight: 500,
              width: 64, textAlign: 'center',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {r.slug === 'seda-ocagi' ? 'Səda' : r.name.split(' ').slice(-1)[0]}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

function FeedPost({ restaurant: r, index, followedIds = [] }) {
  const open = isRestaurantOpen(r.operating_hours)
  const today = getTodayHours(r.operating_hours)
  const emoji = cuisineEmoji(r.cuisine_type)
  const { session } = useAuth()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [saved, setSaved] = useState(false)
  const [showHeart, setShowHeart] = useState(false)
  const [likeAnimating, setLikeAnimating] = useState(false)
  const tapTimer = useRef(null)
  const tapCount = useRef(0)

  useEffect(() => {
    supabase
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('target_type', 'restaurant')
      .eq('target_id', r.id)
      .then(({ count }) => setLikeCount(count || 0))

    if (session) {
      supabase
        .from('likes')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('target_type', 'restaurant')
        .eq('target_id', r.id)
        .maybeSingle()
        .then(({ data }) => setLiked(!!data))
    }
  }, [r.id, session?.user?.id])

  async function toggleLike() {
    const next = !liked
    setLiked(next)
    setLikeCount(c => c + (next ? 1 : -1))
    if (next) { setLikeAnimating(true); setTimeout(() => setLikeAnimating(false), 350) }
    if (!session) return
    try {
      if (next) {
        const { error } = await supabase.from('likes').insert({
          user_id: session.user.id, target_type: 'restaurant', target_id: r.id,
        })
        if (error) { setLiked(false); setLikeCount(c => c - 1) }
      } else {
        const { error } = await supabase.from('likes').delete()
          .eq('user_id', session.user.id)
          .eq('target_type', 'restaurant')
          .eq('target_id', r.id)
        if (error) { setLiked(true); setLikeCount(c => c + 1) }
      }
    } catch { setLiked(!next); setLikeCount(c => c + (next ? -1 : 1)) }
  }

  function handleDoubleTap() {
    tapCount.current++
    if (tapCount.current === 1) {
      tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 300)
    } else if (tapCount.current === 2) {
      clearTimeout(tapTimer.current)
      tapCount.current = 0
      if (!liked) toggleLike()
      setShowHeart(true)
      setTimeout(() => setShowHeart(false), 900)
    }
  }

  const isFollowed = followedIds.includes(r.id)

  return (
    <article className={`menu-card feed-post stagger-item${isFollowed ? ' followed-post' : ''}`} style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
      {/* Post header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 10,
      }}>
        <Link to={`/restaurant/${r.slug}`} style={{ flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: cuisineBackground(r.cuisine_type),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', border: '1.5px solid var(--border)',
          }}>
            {emoji}
          </div>
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link to={`/restaurant/${r.slug}`} style={{ display: 'block' }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--t1)' }}>{r.name}</span>
          </Link>
          <div style={{ fontSize: '0.68rem', color: 'var(--t3)', marginTop: 1 }}>
            {r.address}, {r.city}
          </div>
        </div>
        {open && <span className="open-indicator">Open</span>}
        <button className="icon-btn" style={{ width: 28, height: 28, color: 'var(--t1)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
      </div>

      {/* Post image */}
      <div
        onClick={handleDoubleTap}
        style={{
          width: '100%', aspectRatio: '4/5',
          background: cuisineBackground(r.cuisine_type),
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '7rem',
          cursor: 'pointer',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        <span style={{
          filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))',
          transition: 'transform 0.4s ease',
        }}>{emoji}</span>

        {/* Vignette */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.35) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Cuisine + hours badge */}
        <div style={{
          position: 'absolute', bottom: 14, left: 14,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 10, padding: '6px 12px',
        }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f5f5f5' }}>{r.cuisine_type}</div>
          {today && (
            <div style={{
              fontSize: '0.64rem', color: 'rgba(255,255,255,0.75)', marginTop: 2,
              fontFamily: "'DM Mono', monospace",
            }}>
              {open ? `Until ${today.close}` : `Opens ${today.open}`}
            </div>
          )}
        </div>

        {/* Double-tap perfetto animation */}
        {showHeart && (
          <span style={{
            position: 'absolute', top: '50%', left: '50%',
            fontSize: '5rem',
            animation: 'perfettoBurst 0.9s ease forwards',
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))',
            pointerEvents: 'none',
          }}>
            👌
          </span>
        )}
      </div>

      {/* Action bar — Rufesto unique icons */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 14,
      }}>
        {/* Perfetto — 👌 OK hand like */}
        <button className="icon-btn" onClick={toggleLike}
          style={{ width: 36, height: 36 }}>
          <svg viewBox="0 0 24 24"
            className={likeAnimating ? 'like-btn-active' : ''}
            style={{
              width: 26, height: 26,
              fill: liked ? 'var(--accent)' : 'none',
              stroke: liked ? 'var(--accent)' : 'var(--t1)',
              strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
              transition: 'fill 120ms, stroke 120ms',
            }}>
            <path d="M8 14c-1.5-1-2.5-2.8-2-4.5.5-1.8 2-2.5 3.5-2s2.5 2 2 3.8c-.3 1-1 1.7-1.8 2" />
            <path d="M9.7 13.3c.8-.3 1.8-.2 2.8.5" />
            <path d="M12.5 13.8c.5-2.5 1.2-5 2-6.5.6-1 1.8-1.2 2.5-.5s.5 2-.2 3.5" />
            <path d="M14 14.5c.8-2 1.5-4 2.2-5.2.5-.8 1.5-1 2.2-.3s.3 1.8-.3 3.2" />
            <path d="M15.2 15c.6-1.5 1.2-3 1.8-4 .4-.7 1.3-.8 1.8-.2s.2 1.5-.3 2.8" />
            <path d="M7.5 15c-.5.8-.8 2-.5 3 .5 1.5 2 2.5 4 2.8s4-.2 5.5-1.5c1-1 1.5-2.5 1.5-4" />
          </svg>
        </button>

        {/* Fork + knife — food-native comment */}
        <Link to={`/restaurant/${r.slug}`} className="icon-btn" style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" style={{ width: 24, height: 24, stroke: 'var(--t1)' }}>
            <path d="M7 2v8a3 3 0 006 0V2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 2v20" strokeLinecap="round" />
            <path d="M17 2v6c0 1.1.9 2 2 2h0c0 1.1-.9 2-2 2v10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <div style={{ flex: 1 }} />

        {/* Plate + pin — save to taste later */}
        <button className="icon-btn" onClick={() => setSaved(!saved)}
          style={{ width: 28, height: 28, color: 'var(--t1)' }}>
          <svg viewBox="0 0 24 24" style={{
            width: 24, height: 24,
            fill: saved ? 'none' : 'none',
            stroke: saved ? 'var(--accent)' : 'var(--t1)',
            strokeWidth: 1.8,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            transition: 'all 0.15s',
          }}>
            <ellipse cx="12" cy="14" rx="8" ry="4" fill={saved ? 'var(--accent)' : 'none'} />
            <path d="M12 3v7" />
            <circle cx="12" cy="3" r="1.5" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Likes */}
      {likeCount > 0 && (
        <div style={{
          padding: '0 16px 4px', fontSize: '0.82rem', fontWeight: 700,
          fontFamily: "'DM Mono', monospace",
        }}>
          {likeCount.toLocaleString()} {likeCount === 1 ? 'like' : 'likes'}
        </div>
      )}

      {/* Caption */}
      <div style={{ padding: '2px 16px 14px' }}>
        <p style={{ fontSize: '0.86rem', lineHeight: 1.55 }}>
          <Link to={`/restaurant/${r.slug}`} style={{
            fontWeight: 700, color: 'var(--t1)',
            fontFamily: "'Playfair Display', serif",
          }}>
            {r.name}
          </Link>
          {' '}
          <span style={{ color: 'var(--t2)', fontWeight: 400 }}>
            {r.description && (r.description.length > 120
              ? r.description.slice(0, 120) + '…'
              : r.description)}
          </span>
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <Link to={`/restaurant/${r.slug}`} style={{
            fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 600,
          }}>
            View menu →
          </Link>
          {r.seating_capacity && (
            <span style={{
              fontSize: '0.65rem', color: 'var(--t4)',
              fontFamily: "'DM Mono', monospace",
              textTransform: 'uppercase', letterSpacing: 0.8,
            }}>
              {r.seating_capacity} seats
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

/** Interleave reviews and restaurants: review, restaurant, review, restaurant... */
function buildFeed(reviews, restaurants) {
  const feed = []
  const ri = [...restaurants]
  const rv = [...reviews]
  let rIdx = 0, vIdx = 0
  while (vIdx < rv.length || rIdx < ri.length) {
    if (vIdx < rv.length) feed.push({ ...rv[vIdx++], _type: 'review' })
    if (rIdx < ri.length) feed.push({ ...ri[rIdx++], _type: 'restaurant' })
  }
  return feed
}

function ReviewPostCard({ review: rev, index, onDishClick }) {
  const dish = rev.dishes
  const restaurant = dish?.restaurants
  const emoji = categoryEmoji(dish?.category)
  const { session } = useAuth()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [saved, setSaved] = useState(false)
  const [showThread, setShowThread] = useState(false)
  const [replies, setReplies] = useState([])
  const [loadingReplies, setLoadingReplies] = useState(false)
  const [likeAnimating, setLikeAnimating] = useState(false)

  useEffect(() => {
    supabase
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('target_type', 'review')
      .eq('target_id', rev.id)
      .then(({ count }) => setLikeCount(count || 0))

    if (session) {
      supabase
        .from('likes')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('target_type', 'review')
        .eq('target_id', rev.id)
        .maybeSingle()
        .then(({ data }) => setLiked(!!data))
    }
  }, [rev.id, session?.user?.id])

  useEffect(() => {
    if (session && dish) {
      supabase
        .from('saved_dishes')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('dish_id', dish.id || rev.dish_id)
        .maybeSingle()
        .then(({ data }) => setSaved(!!data))
    }
  }, [session?.user?.id, dish?.id])

  async function toggleLike() {
    const next = !liked
    setLiked(next)
    setLikeCount(c => c + (next ? 1 : -1))
    if (next) { setLikeAnimating(true); setTimeout(() => setLikeAnimating(false), 350) }
    if (!session) return
    try {
      if (next) {
        const { error } = await supabase.from('likes').insert({
          user_id: session.user.id, target_type: 'review', target_id: rev.id,
        })
        if (error) { setLiked(false); setLikeCount(c => c - 1) }
      } else {
        const { error } = await supabase.from('likes').delete()
          .eq('user_id', session.user.id)
          .eq('target_type', 'review')
          .eq('target_id', rev.id)
        if (error) { setLiked(true); setLikeCount(c => c + 1) }
      }
    } catch { setLiked(!next); setLikeCount(c => c + (next ? -1 : 1)) }
  }

  async function handleToggleSave() {
    if (!dish) return
    const next = !saved
    setSaved(next)
    if (!session) return
    const dishId = dish.id || rev.dish_id
    try {
      if (next) {
        const { error } = await supabase.from('saved_dishes').upsert(
          { user_id: session.user.id, dish_id: dishId },
          { onConflict: 'user_id,dish_id' }
        )
        if (error) { console.error('Save failed:', error.message); setSaved(false) }
      } else {
        const { error } = await supabase.from('saved_dishes').delete().eq('user_id', session.user.id).eq('dish_id', dishId)
        if (error) { console.error('Unsave failed:', error.message); setSaved(true) }
      }
    } catch (err) {
      console.error('Save error:', err)
      setSaved(!next)
    }
  }

  async function toggleThread() {
    if (showThread) { setShowThread(false); return }
    if (replies.length === 0) {
      setLoadingReplies(true)
      const { data } = await supabase
        .from('reviews')
        .select('*, users(name, profile_photo)')
        .eq('dish_id', rev.dish_id)
        .neq('id', rev.id)
        .eq('is_flagged', false)
        .order('created_at', { ascending: true })
        .limit(10)
      setReplies(data || [])
      setLoadingReplies(false)
    }
    setShowThread(true)
  }

  return (
    <article className="menu-card feed-post stagger-item" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
      {/* Post header — reviewer info */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 10,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'var(--s3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
          border: '1.5px solid var(--border)',
        }}>
          {(rev.users?.name || 'A')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--t1)' }}>
            {rev.users?.name || 'Anonymous'}
          </span>
          <div style={{ fontSize: '0.68rem', color: 'var(--t3)', marginTop: 1 }}>
            <Link to={`/restaurant/${restaurant?.slug}`} style={{ color: 'var(--t3)' }}>
              {dish?.name} at {restaurant?.name}
            </Link>
          </div>
        </div>
        <span style={{
          color: 'var(--gold)', fontSize: '0.78rem', letterSpacing: 1,
          fontFamily: "'DM Mono', monospace",
        }}>
          {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
        </span>
      </div>

      {/* Dish photo area — tap opens dish detail */}
      <div onClick={() => dish && onDishClick(dish)} style={{
        width: '100%', aspectRatio: '4/3',
        background: dish?.photo ? '#000' : dishBackground(dish?.category),
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '5rem', overflow: 'hidden',
        cursor: 'pointer',
      }}>
        {dish?.photo ? (
          <img src={dish.photo} alt={dish.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
        ) : (
          <span style={{ filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.5))' }}>
            {emoji}
          </span>
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.3) 100%)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Action bar */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '8px 14px', gap: 14,
      }}>
        <button className="icon-btn" onClick={toggleLike} style={{ width: 36, height: 36 }}>
          <svg viewBox="0 0 24 24"
            className={likeAnimating ? 'like-btn-active' : ''}
            style={{
              width: 26, height: 26,
              fill: liked ? 'var(--accent)' : 'none',
              stroke: liked ? 'var(--accent)' : 'var(--t1)',
              strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
              transition: 'fill 120ms, stroke 120ms',
            }}>
            <path d="M8 14c-1.5-1-2.5-2.8-2-4.5.5-1.8 2-2.5 3.5-2s2.5 2 2 3.8c-.3 1-1 1.7-1.8 2" />
            <path d="M9.7 13.3c.8-.3 1.8-.2 2.8.5" />
            <path d="M12.5 13.8c.5-2.5 1.2-5 2-6.5.6-1 1.8-1.2 2.5-.5s.5 2-.2 3.5" />
            <path d="M14 14.5c.8-2 1.5-4 2.2-5.2.5-.8 1.5-1 2.2-.3s.3 1.8-.3 3.2" />
            <path d="M15.2 15c.6-1.5 1.2-3 1.8-4 .4-.7 1.3-.8 1.8-.2s.2 1.5-.3 2.8" />
            <path d="M7.5 15c-.5.8-.8 2-.5 3 .5 1.5 2 2.5 4 2.8s4-.2 5.5-1.5c1-1 1.5-2.5 1.5-4" />
          </svg>
        </button>

        <button className="icon-btn" onClick={toggleThread} style={{ width: 36, height: 36 }}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" style={{ width: 24, height: 24, stroke: 'var(--t1)' }}>
            <path d="M7 2v8a3 3 0 006 0V2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 2v20" strokeLinecap="round" />
            <path d="M17 2v6c0 1.1.9 2 2 2h0c0 1.1-.9 2-2 2v10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div style={{ flex: 1 }} />

        <button className="icon-btn" onClick={handleToggleSave} style={{ width: 36, height: 36, color: 'var(--t1)' }}>
          <svg viewBox="0 0 24 24" style={{
            width: 26, height: 26,
            stroke: saved ? 'var(--accent)' : 'var(--t1)',
            strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
            transition: 'stroke 150ms',
          }}>
            <ellipse cx="12" cy="14" rx="8" ry="4" fill={saved ? 'var(--accent)' : 'none'} />
            <path d="M12 3v7" />
            <circle cx="12" cy="3" r="1.5" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Like count */}
      {likeCount > 0 && (
        <div style={{
          padding: '0 16px 4px', fontSize: '0.82rem', fontWeight: 700,
          fontFamily: "'DM Mono', monospace",
        }}>
          {likeCount.toLocaleString()} {likeCount === 1 ? 'like' : 'likes'}
        </div>
      )}

      {/* Review body */}
      <div style={{ padding: '0 16px 10px' }}>
        <p style={{ fontSize: '0.86rem', lineHeight: 1.55 }}>
          <span style={{ fontWeight: 700, color: 'var(--t1)' }}>
            {rev.users?.name || 'Anonymous'}
          </span>
          {' '}
          <span style={{ color: 'var(--t2)', fontWeight: 400 }}>
            {rev.body || `Rated ${dish?.name} ${rev.rating}/5`}
          </span>
        </p>
        <span style={{
          fontSize: '0.68rem', color: 'var(--t4)',
          fontFamily: "'DM Mono', monospace",
        }}>{timeAgo(rev.created_at)}</span>
      </div>

      {/* Thread toggle */}
      <button onClick={toggleThread} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '0 16px 12px',
        fontSize: '0.76rem', color: 'var(--t3)',
        display: 'flex', alignItems: 'center', gap: 5,
        transition: 'color 150ms',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {loadingReplies ? 'Loading…' :
         showThread ? 'Hide replies' :
         'View replies'}
      </button>

      {/* Comment thread */}
      {showThread && replies.length > 0 && (
        <CommentThread comments={replies} />
      )}
    </article>
  )
}

function CommentThread({ comments }) {
  return (
    <div style={{ padding: '0 14px 12px' }}>
      {comments.map((c, i) => (
        <div key={c.id} style={{ display: 'flex', gap: 10, paddingLeft: 8 }}>
          {/* Thread line */}
          <div style={{
            width: 2, background: 'var(--border)',
            marginTop: 4, marginBottom: i === comments.length - 1 ? 0 : -4,
            flexShrink: 0,
          }} />
          {/* Comment */}
          <div style={{ paddingBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--t1)' }}>
                {c.users?.name || 'Anonymous'}
              </span>
              <span style={{ color: 'var(--gold)', fontSize: '0.65rem' }}>
                {'★'.repeat(c.rating)}
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--t3)' }}>{timeAgo(c.created_at)}</span>
            </div>
            {c.body && (
              <p style={{ fontSize: '0.82rem', color: 'var(--t2)', lineHeight: 1.4 }}>{c.body}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function StoriesBarSkeleton() {
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '16px',
      borderBottom: '1px solid var(--border)',
    }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div className="skeleton" style={{ width: 64, height: 72, borderRadius: 12 }} />
          <div className="skeleton" style={{ width: 44, height: 9, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}

function PostSkeleton() {
  return (
    <div style={{ maxWidth: 470, margin: '0 auto', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 12, width: '38%', marginBottom: 5 }} />
          <div className="skeleton" style={{ height: 9, width: '52%' }} />
        </div>
      </div>
      <div className="skeleton" style={{ width: '100%', aspectRatio: '4/5', borderRadius: 0 }} />
      <div style={{ padding: '12px 16px' }}>
        <div className="skeleton" style={{ height: 11, width: '80%', marginBottom: 7 }} />
        <div className="skeleton" style={{ height: 11, width: '55%' }} />
      </div>
    </div>
  )
}
