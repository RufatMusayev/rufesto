import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cuisineEmoji, cuisineBackground, isRestaurantOpen, getTodayHours } from '../lib/helpers'

export default function HomePage() {
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('restaurants')
      .select('*, operating_hours(*)')
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => { setRestaurants(data || []); setLoading(false) })
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
            {restaurants.map((r, i) => (
              <FeedPost key={r.id} restaurant={r} index={i} />
            ))}
          </div>
        </>
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

        {/* Double-tap heart animation */}
        {showHeart && (
          <svg viewBox="0 0 24 24" fill="#fff" style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 80, height: 80,
            animation: 'heartBurst 0.9s ease forwards',
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))',
            pointerEvents: 'none',
          }}>
            <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
        )}
      </div>

      {/* Action bar */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 14,
      }}>
        <button className="icon-btn" onClick={() => setLiked(!liked)}
          style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 24 24" style={{
            width: 24, height: 24,
            fill: liked ? '#ef4444' : 'none',
            stroke: liked ? '#ef4444' : 'var(--t1)',
            strokeWidth: 1.8,
            transition: 'all 0.15s',
          }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
        </button>

        <Link to={`/restaurant/${r.slug}`} className="icon-btn" style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" style={{ width: 24, height: 24, stroke: 'var(--t1)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
          </svg>
        </Link>

        <button className="icon-btn" style={{ width: 28, height: 28, color: 'var(--t1)' }}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" style={{ width: 24, height: 24, stroke: 'currentColor' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>

        <div style={{ flex: 1 }} />

        <button className="icon-btn" onClick={() => setSaved(!saved)}
          style={{ width: 28, height: 28, color: 'var(--t1)' }}>
          <svg viewBox="0 0 24 24" style={{
            width: 24, height: 24,
            fill: saved ? 'var(--t1)' : 'none',
            stroke: 'var(--t1)',
            strokeWidth: 1.8,
            transition: 'all 0.15s',
          }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0z" />
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
