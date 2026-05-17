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

  useEffect(() => {
    Promise.all([
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
        .limit(10),
    ]).then(([{ data: restData }, { data: revData }]) => {
      setRestaurants(restData || [])
      setReviews(revData || [])
      setLoading(false)
    })
  }, [])

  return (
    <div>
      {loading ? (
        <>
          <StoriesBarSkeleton />
          {[1, 2].map(i => <PostSkeleton key={i} />)}
        </>
      ) : (
        <>
          <StoriesBar restaurants={restaurants} />
          <div style={{ maxWidth: 470, margin: '0 auto' }}>
            {/* Interleaved feed: review posts + restaurant promo cards */}
            {buildFeed(reviews, restaurants).map((item, i) =>
              item._type === 'review'
                ? <ReviewPostCard key={`rev-${item.id}`} review={item} index={i} onDishClick={setDishDetail} />
                : <FeedPost key={`rest-${item.id}`} restaurant={item} index={i} />
            )}
          </div>
        </>
      )}

      {dishDetail && (
        <DishDetailSheet dish={dishDetail} onClose={() => setDishDetail(null)} />
      )}
    </div>
  )
}

function StoriesBar({ restaurants }) {
  return (
    <div className="no-scrollbar" style={{
      display: 'flex', gap: 18, padding: '14px 16px',
      overflowX: 'auto',
      borderBottom: '1px solid var(--border)',
      maxWidth: 470, margin: '0 auto',
    }}>
      {restaurants.map(r => {
        const open = isRestaurantOpen(r.operating_hours)
        return (
          <Link key={r.id} to={`/restaurant/${r.slug}`} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            flexShrink: 0, textDecoration: 'none',
          }}>
            <div className={`ig-story-ring${open ? '' : ' seen'}`}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                border: '3px solid var(--bg)',
                background: cuisineBackground(r.cuisine_type),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.5rem',
              }}>
                {cuisineEmoji(r.cuisine_type)}
              </div>
            </div>
            <span style={{
              fontSize: '0.68rem', color: 'var(--t2)', fontWeight: 400,
              width: 64, textAlign: 'center',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {r.slug === 'seda-ocagi' ? 'Səda' : r.name.split(' ').pop()}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

function FeedPost({ restaurant: r, index }) {
  const open = isRestaurantOpen(r.operating_hours)
  const today = getTodayHours(r.operating_hours)
  const emoji = cuisineEmoji(r.cuisine_type)
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showHeart, setShowHeart] = useState(false)
  const tapTimer = useRef(null)
  const tapCount = useRef(0)

  function handleDoubleTap() {
    tapCount.current++
    if (tapCount.current === 1) {
      tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 300)
    } else if (tapCount.current === 2) {
      clearTimeout(tapTimer.current)
      tapCount.current = 0
      if (!liked) setLiked(true)
      setShowHeart(true)
      setTimeout(() => setShowHeart(false), 900)
    }
  }

  return (
    <article className="menu-card feed-post" style={{ animationDelay: `${index * 0.08}s` }}>
      {/* Post header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 10,
      }}>
        <Link to={`/restaurant/${r.slug}`}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: cuisineBackground(r.cuisine_type),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.85rem', flexShrink: 0,
          }}>
            {emoji}
          </div>
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link to={`/restaurant/${r.slug}`} style={{ display: 'block' }}>
            <span style={{
              fontWeight: 700, fontSize: '0.82rem', color: 'var(--t1)',
            }}>{r.name}</span>
          </Link>
          <div style={{ fontSize: '0.7rem', color: 'var(--t3)' }}>
            {r.address}, {r.city}
          </div>
        </div>
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

        {/* Open badge */}
        {open && (
          <div style={{
            position: 'absolute', top: 14, right: 14,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderRadius: 100, padding: '4px 10px',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#22C55E',
              boxShadow: '0 0 6px #22C55E',
            }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#f5f5f5' }}>Open</span>
          </div>
        )}

        {/* Cuisine badge */}
        <div style={{
          position: 'absolute', bottom: 16, left: 16,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderRadius: 8, padding: '6px 12px',
        }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f5f5f5' }}>{r.cuisine_type}</div>
          {today && (
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
              {open ? `Open until ${today.close}` : `Opens ${today.open}`}
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
        <button className="icon-btn" onClick={() => setLiked(!liked)}
          style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 24 24" style={{
            width: 24, height: 24,
            fill: liked ? 'var(--accent)' : 'none',
            stroke: liked ? 'var(--accent)' : 'var(--t1)',
            strokeWidth: 1.8,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            transition: 'all 0.15s',
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
      {liked && (
        <div style={{ padding: '0 14px 4px', fontSize: '0.82rem', fontWeight: 700 }}>
          1 like
        </div>
      )}

      {/* Caption */}
      <div style={{ padding: '0 14px 10px' }}>
        <p style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
          <Link to={`/restaurant/${r.slug}`} style={{ fontWeight: 700, color: 'var(--t1)' }}>
            {r.name}
          </Link>
          {' '}
          <span style={{ color: 'var(--t2)', fontWeight: 400 }}>
            {r.description && (r.description.length > 100
              ? r.description.slice(0, 100) + '…'
              : r.description
            )}
          </span>
        </p>

        <Link to={`/restaurant/${r.slug}`} style={{
          display: 'block', fontSize: '0.82rem', color: 'var(--t3)',
          marginTop: 4,
        }}>
          View all dishes
        </Link>

        {r.seating_capacity && (
          <div style={{ fontSize: '0.68rem', color: 'var(--t4)', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {r.seating_capacity} seats
          </div>
        )}
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
  const [saved, setSaved] = useState(false)
  const [showThread, setShowThread] = useState(false)
  const [replies, setReplies] = useState([])
  const [loadingReplies, setLoadingReplies] = useState(false)

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
    <article className="menu-card feed-post" style={{ animationDelay: `${index * 0.08}s` }}>
      {/* Post header — reviewer info */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--s4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.7rem', fontWeight: 700, color: 'var(--t2)', flexShrink: 0,
        }}>
          {(rev.users?.name || 'A')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--t1)' }}>
            {rev.users?.name || 'Anonymous'}
          </span>
          <div style={{ fontSize: '0.7rem', color: 'var(--t3)' }}>
            <Link to={`/restaurant/${restaurant?.slug}`} style={{ color: 'var(--t3)' }}>
              {dish?.name} at {restaurant?.name}
            </Link>
          </div>
        </div>
        <span style={{ color: 'var(--gold)', fontSize: '0.72rem', letterSpacing: 0.5 }}>
          {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
        </span>
      </div>

      {/* Dish photo area — tap opens dish detail */}
      <div onClick={() => dish && onDishClick(dish)} style={{
        width: '100%', aspectRatio: '4/3',
        background: dishBackground(dish?.category),
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '5rem', overflow: 'hidden',
        cursor: 'pointer',
      }}>
        <span style={{ filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.5))' }}>
          {emoji}
        </span>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.3) 100%)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Action bar */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 14,
      }}>
        <button className="icon-btn" onClick={() => setLiked(!liked)}
          style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 24 24" style={{
            width: 24, height: 24,
            fill: liked ? 'var(--accent)' : 'none',
            stroke: liked ? 'var(--accent)' : 'var(--t1)',
            strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
            transition: 'all 0.15s',
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
        <button className="icon-btn" onClick={toggleThread}
          style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" style={{ width: 24, height: 24, stroke: 'var(--t1)' }}>
            <path d="M7 2v8a3 3 0 006 0V2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 2v20" strokeLinecap="round" />
            <path d="M17 2v6c0 1.1.9 2 2 2h0c0 1.1-.9 2-2 2v10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div style={{ flex: 1 }} />

        <button className="icon-btn" onClick={handleToggleSave}
          style={{ width: 28, height: 28, color: 'var(--t1)' }}>
          <svg viewBox="0 0 24 24" style={{
            width: 24, height: 24, fill: saved ? 'none' : 'none',
            stroke: saved ? 'var(--accent)' : 'var(--t1)',
            strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
            transition: 'all 0.15s',
          }}>
            <ellipse cx="12" cy="14" rx="8" ry="4" fill={saved ? 'var(--accent)' : 'none'} />
            <path d="M12 3v7" />
            <circle cx="12" cy="3" r="1.5" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Review body */}
      <div style={{ padding: '0 14px 10px' }}>
        <p style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: 'var(--t1)' }}>
            {rev.users?.name || 'Anonymous'}
          </span>
          {' '}
          <span style={{ color: 'var(--t2)', fontWeight: 400 }}>
            {rev.body || `Rated ${dish?.name} ${rev.rating}/5`}
          </span>
        </p>
        <span style={{ fontSize: '0.68rem', color: 'var(--t4)' }}>{timeAgo(rev.created_at)}</span>
      </div>

      {/* Thread toggle */}
      <button onClick={toggleThread} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '0 14px 10px',
        fontSize: '0.78rem', color: 'var(--t3)', display: 'block',
      }}>
        {loadingReplies ? 'Loading...' :
         showThread ? 'Hide replies' :
         `View replies for this dish`}
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
      display: 'flex', gap: 18, padding: '14px 16px',
      borderBottom: '1px solid var(--border)',
      maxWidth: 470, margin: '0 auto',
    }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div className="skeleton" style={{ width: 62, height: 62, borderRadius: '50%' }} />
          <div className="skeleton" style={{ width: 40, height: 10 }} />
        </div>
      ))}
    </div>
  )
}

function PostSkeleton() {
  return (
    <div className="feed-post" style={{ maxWidth: 470, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <div className="skeleton" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 12, width: '40%', marginBottom: 4 }} />
          <div className="skeleton" style={{ height: 10, width: '55%' }} />
        </div>
      </div>
      <div className="skeleton" style={{ width: '100%', aspectRatio: '4/5', borderRadius: 0 }} />
      <div style={{ padding: '10px 14px' }}>
        <div className="skeleton" style={{ height: 12, width: '85%', marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 12, width: '60%' }} />
      </div>
    </div>
  )
}
